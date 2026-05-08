import { IsBoolean, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateAddressDto {
    @IsNotEmpty()
    @IsString()
    userId!: string;
    
    @IsNotEmpty()
    @IsString()
    label: string = '';

    @IsNotEmpty()
    @IsString()
    receiverName!: string;

    @IsNotEmpty()
    @IsString()
    receiverPhone!: string;

    @IsNotEmpty()
    @IsString()
    province!: string;

    @IsNotEmpty()
    @IsString()
    ward!: string;

    @IsNotEmpty()
    @IsString()
    detail!: string;

    @IsOptional()
    @IsBoolean()
    isDefault?: boolean = false;
}
