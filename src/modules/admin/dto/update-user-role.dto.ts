import { IsIn } from 'class-validator';

export class UpdateUserRoleDto {
  @IsIn(['buyer', 'seller'])
  role!: 'buyer' | 'seller';
}