import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { AddressesService } from './addresses.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Controller('addresses')
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Post()
  createNewAddress(@Body() createAddressDto: CreateAddressDto) {
    return this.addressesService.createNewAddress(createAddressDto);
  }

  @Get('user/:userId')
  getAddressesByUserId(@Param('userId') userId: string) {
    return this.addressesService.getAddressesByUserId(userId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateAddressDto: UpdateAddressDto) {
    return this.addressesService.updateAddress(id, updateAddressDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.addressesService.removeAddress(id);
  }
}
