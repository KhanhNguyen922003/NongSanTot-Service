import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  success: boolean;
  data: T;
  message?: string;
  meta?: any;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    return next.handle().pipe(
      map(data => {
        const isObject = typeof data === 'object' && data !== null;
        
        // Handle paginated responses or specific structures if needed
        const meta = isObject && data.meta ? data.meta : undefined;
        const message = isObject && data.message ? data.message : 'Success';
        const actualData = isObject && data.data !== undefined ? data.data : data;

        return {
          success: true,
          data: actualData,
          message,
          meta
        };
      })
    );
  }
}
