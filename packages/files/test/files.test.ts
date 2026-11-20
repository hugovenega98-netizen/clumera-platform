import { describe, expect, it } from 'vitest';
import { detectType, safeFilename } from '../src';

describe('Archivos', () => {
  it('reconoce el tipo por la firma, no por el nombre', () => {
    expect(detectType(new TextEncoder().encode('%PDF-1.7 ...'))).toEqual({ contentType: 'application/pdf', ext: 'pdf' });
    expect(detectType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toEqual({ contentType: 'image/png', ext: 'png' });
    expect(detectType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toEqual({ contentType: 'image/jpeg', ext: 'jpg' });
    expect(detectType(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toEqual({ contentType: 'image/webp', ext: 'webp' });
    expect(detectType(new TextEncoder().encode('<html><script>alert(1)</script>'))).toBeNull();
    expect(detectType(new TextEncoder().encode('MZ\x90\0'))).toBeNull();
  });
  it('limpia el nombre y pone la extensión real', () => {
    expect(safeFilename('../../etc/apto físico.exe', 'pdf')).toBe('apto físico.pdf');
    expect(safeFilename('C:\\fotos\\dni<script>.png', 'jpg')).toBe('dniscript.jpg');
    expect(safeFilename('', 'pdf')).toBe('documento.pdf');
  });
});
