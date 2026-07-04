import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './auth.dto';

const REFRESH_COOKIE = 'fable_rt';
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/api/v1/auth',
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const { user, accessToken, refreshToken } = this.auth.register(
      dto.email,
      dto.password,
      dto.name,
    );
    res.cookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTS);
    return { user, accessToken };
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { user, accessToken, refreshToken } = this.auth.login(dto.email, dto.password);
    res.cookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTS);
    return { user, accessToken };
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { user, accessToken, refreshToken } = this.auth.refresh(
      req.cookies?.[REFRESH_COOKIE],
    );
    res.cookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTS);
    return { user, accessToken };
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: COOKIE_OPTS.path });
  }
}
