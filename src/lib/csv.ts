import { toCsv } from './format';

export function csvResponse(filename: string, headers: string[], rows: unknown[][]) {
  return new Response('﻿' + toCsv(headers, rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
