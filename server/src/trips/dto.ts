import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

// ---------- Trips ----------
export class CreateTripDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  cover_image?: string;

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;
}

export class UpdateTripDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  cover_image?: string;

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;
}

// ---------- Members ----------
export class InviteMemberDto {
  @IsEmail()
  email: string;

  @IsIn(['editor', 'viewer'])
  role: 'editor' | 'viewer';
}

export class UpdateMemberDto {
  @IsIn(['editor', 'viewer'])
  role: 'editor' | 'viewer';
}

// ---------- Days ----------
export class CreateDayDto {
  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateDayDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ---------- Places ----------
export class CreatePlaceDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  photo_url?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  hours?: string;
}

export class UpdatePlaceDto extends CreatePlaceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  declare name: string;

  @IsOptional()
  @IsString()
  day_id?: string;

  @IsOptional()
  @IsInt()
  order_index?: number;
}

export class ReorderItemDto {
  @IsString()
  id: string;

  @IsInt()
  order_index: number;
}

export class ReorderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  items: ReorderItemDto[];
}

// ---------- Day notes ----------
export class CreateNoteDto {
  @IsString()
  @MinLength(1)
  content: string;

  @IsOptional()
  @IsString()
  icon?: string;
}

export class UpdateNoteDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  content?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsInt()
  order_index?: number;
}

// ---------- Reservations ----------
export class CreateReservationDto {
  @IsIn(['flight', 'accommodation', 'restaurant', 'transport'])
  type: string;

  @IsString()
  @MinLength(1)
  title: string;

  @IsOptional()
  @IsString()
  confirmation_number?: string;

  @IsOptional()
  @IsDateString()
  start_datetime?: string;

  @IsOptional()
  @IsDateString()
  end_datetime?: string;

  @IsOptional()
  @IsIn(['confirmed', 'pending', 'cancelled'])
  status?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsNumber()
  cost?: number;

  @IsOptional()
  @IsString()
  attachment_url?: string;
}

export class UpdateReservationDto extends CreateReservationDto {
  @IsOptional()
  @IsIn(['flight', 'accommodation', 'restaurant', 'transport'])
  declare type: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  declare title: string;
}

// ---------- Budget ----------
export class CreateBudgetItemDto {
  @IsString()
  @MinLength(1)
  category: string;

  @IsString()
  @MinLength(1)
  label: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  paid_by_user_id?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  split_among?: string[];
}

export class UpdateBudgetItemDto extends CreateBudgetItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  declare category: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  declare label: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  declare amount: number;
}

// ---------- Packing ----------
export class CreatePackingItemDto {
  @IsString()
  @MinLength(1)
  label: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  assigned_to_user_id?: string;
}

export class UpdatePackingItemDto extends CreatePackingItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  declare label: string;

  @IsOptional()
  @IsBoolean()
  packed?: boolean;
}
