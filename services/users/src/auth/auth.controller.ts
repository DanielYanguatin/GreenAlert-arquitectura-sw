import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type Identity, Public } from '../common/identity';
import { UsersService } from '../users/users.service';
import type { UserView } from '../users/user.entity';
import { LoginDto, RegisterDto, TokenResponseDto } from './dto/auth.dto';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Post('register')
  @Public()
  @ApiOperation({ summary: 'Registro público de ciudadanos' })
  @ApiCreatedResponse({ description: 'Usuario creado con rol CIUDADANO' })
  register(@Body() dto: RegisterDto): Promise<UserView> {
    return this.auth.register(dto);
  }

  @Post('login')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Inicio de sesión; devuelve un JWT' })
  @ApiOkResponse({ type: TokenResponseDto })
  login(@Body() dto: LoginDto): Promise<TokenResponseDto & { user: UserView }> {
    return this.auth.login(dto);
  }

  @Post('logout')
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cierra la sesión revocando el token actual' })
  async logout(@CurrentUser() identity: Identity): Promise<void> {
    await this.auth.logout(identity);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Perfil del usuario autenticado' })
  me(@CurrentUser() identity: Identity): Promise<UserView> {
    return this.users.getProfile(identity.userId);
  }
}

/** Endpoints de uso exclusivo del API Gateway. */
@ApiTags('internal')
@Controller('internal/auth')
export class InternalAuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('revoked/:jti')
  @Public()
  @ApiOperation({ summary: '[Interno] Indica si un token fue revocado' })
  async isRevoked(@Param('jti', new ParseUUIDPipe()) jti: string): Promise<{ revoked: boolean }> {
    return { revoked: await this.auth.isRevoked(jti) };
  }
}
