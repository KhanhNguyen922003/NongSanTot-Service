import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { addresses } from '@/core/database/schema';
import { db } from '@/core/database/db';

@Injectable()
export class AddressesService {
  async createNewAddress(createAddressDto: CreateAddressDto) {
    const [address] = await db
      .insert(addresses)
      .values({
        userId: createAddressDto.userId,
        label: createAddressDto.label,
        receiverName: createAddressDto.receiverName,
        receiverPhone: createAddressDto.receiverPhone,
        province: createAddressDto.province,
        ward: createAddressDto.ward,
        detail: createAddressDto.detail,
        isDefault: createAddressDto.isDefault,
        createdAt: new Date(),
      })
      .returning();

    return address;
  }

  getAddressesByUserId(userId: string) {
    return db.query.addresses.findMany({
      where: eq(addresses.userId, userId),
    });
  }

  async updateAddress(id: string, updateAddressDto: UpdateAddressDto) {
    const [address] = await db
      .update(addresses)
      .set(updateAddressDto)
      .where(eq(addresses.id, id))
      .returning();
    return address;
  }

  async removeAddress(id: string) {
    await db.delete(addresses).where(eq(addresses.id, id));
  }
}
