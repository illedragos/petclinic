import { ApiProperty } from '@nestjs/swagger';
import { OwnerDto } from './owner.dto';

/**
 * A page of owners. Mirrors Spring's Page shape (content / totalElements /
 * totalPages / number / size) so the Angular frontend's owner-page.ts and
 * Material paginator map across with zero translation. `number` is 0-based.
 */
export class OwnerPageDto {
  @ApiProperty({ type: () => [OwnerDto], description: 'The owners on this page.' })
  content: OwnerDto[] = [];

  @ApiProperty({ example: 42, description: 'Total number of owners matching the filter.' })
  totalElements!: number;

  @ApiProperty({ example: 5, description: 'Total number of pages for the current page size.' })
  totalPages!: number;

  @ApiProperty({ example: 0, description: 'The 0-based index of this page.' })
  number!: number;

  @ApiProperty({ example: 10, description: 'The page size used for this page.' })
  size!: number;
}
