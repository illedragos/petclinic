import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

/** Upper bound on page size — keeps a hand-crafted ?size= from re-opening "unpaged" mode. */
export const MAX_PAGE_SIZE = 100;

/**
 * Query parameters for GET /api/owners (issue #25, D8).
 *
 * Validated by the global ValidationPipe (transform: true, whitelist: true,
 * enableImplicitConversion: false). Because implicit conversion is off, the
 * numeric params need an explicit `@Type(() => Number)` to coerce the string
 * query values before `@IsInt`. Invalid input renders as a 400 ProblemDetail.
 *
 * Bounds close two TypeORM footguns: size=0 (which can drop the LIMIT and return
 * every row) and page=-1 (negative OFFSET -> Postgres error), plus the uncapped
 * size that would otherwise be an unpaged escape hatch.
 */
export class ListOwnersQueryDto {
  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description: 'Full-text search across firstName, lastName, address, city, telephone, and pet names.',
  })
  q: string = '';

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be an integer' })
  @Min(0, { message: 'page must be >= 0' })
  @ApiPropertyOptional({ minimum: 0, default: 0, description: 'Zero-based page index.' })
  page: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'size must be an integer' })
  @Min(1, { message: 'size must be >= 1' })
  @Max(MAX_PAGE_SIZE, { message: `size must be <= ${MAX_PAGE_SIZE}` })
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: 10, description: 'Page size.' })
  size: number = 10;

  @IsOptional()
  @Matches(/^(name|address|city|telephone),(asc|desc)$/i, {
    message:
      'sort must be "<column>,<dir>" where column is one of name|address|city|telephone and dir is asc|desc',
  })
  @ApiPropertyOptional({
    description: 'Sort as "<column>,<dir>". Columns: name, address, city, telephone. Direction: asc, desc.',
    example: 'name,asc',
  })
  sort?: string;
}
