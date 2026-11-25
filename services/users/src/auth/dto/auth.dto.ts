import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);
const normalizeEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/;

export class RegisterDto {
  @ApiProperty({ example: 'ciudadano@example.com' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'El correo no es válido' })
  @MaxLength(160)
  email: string;

  @ApiProperty({ example: 'Clave1234', description: '8-72 caracteres, con mayúscula, minúscula y número' })
  @IsString()
  @Matches(PASSWORD_RULE, {
    message: 'La contraseña debe tener entre 8 y 72 caracteres e incluir mayúscula, minúscula y número',
  })
  password: string;

  @ApiProperty({ example: 'María Pérez' })
  @Transform(trim)
  @IsString()
  @Length(3, 120)
  fullName: string;

  @ApiPropertyOptional({ example: '3101234567' })
  @IsOptional()
  @Matches(/^\+?\d{7,15}$/, { message: 'Teléfono no válido' })
  phone?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'ciudadano@example.com' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'El correo no es válido' })
  email: string;

  @ApiProperty({ example: 'Clave1234' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password: string;
}

export class TokenResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType: string;

  @ApiProperty({ description: 'Segundos hasta la caducidad' })
  expiresIn: number;
}
