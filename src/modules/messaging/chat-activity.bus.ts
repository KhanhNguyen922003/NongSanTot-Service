import { Injectable } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { Observable, Subject, filter, interval, map, merge } from 'rxjs';

/** Luồng server→client (SSE) khi có hoạt động trong một hội thoại — không cần Firebase RTDB. */
@Injectable()
export class ChatActivityBus {
  private readonly activity = new Subject<string>();

  notify(conversationId: string) {
    this.activity.next(conversationId);
  }

  /** Một kết nối SSE: chỉ nhận sự kiện của đúng `conversationId` + ping giữ kênh. */
  stream(conversationId: string): Observable<MessageEvent> {
    const activity$ = this.activity.pipe(
      filter((id) => id === conversationId),
      map(
        () =>
          ({
            data: JSON.stringify({ type: 'activity' }),
          }) as MessageEvent,
      ),
    );
    const ping$ = interval(30000).pipe(
      map(
        () =>
          ({
            data: JSON.stringify({ type: 'ping' }),
          }) as MessageEvent,
      ),
    );
    return merge(activity$, ping$);
  }
}
