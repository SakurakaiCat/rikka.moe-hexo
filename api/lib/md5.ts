const MD5_SHIFT_AMOUNTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const MD5_TABLE = Array.from(
  { length: 64 },
  (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x1_0000_0000) >>> 0,
);

const rotateLeft = (value: number, amount: number) =>
  ((value << amount) | (value >>> (32 - amount))) >>> 0;

const bytesToHex = (value: Uint8Array) =>
  Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');

export const md5Hex = (input: string) => {
  const source = new TextEncoder().encode(input);
  const bitLength = source.length * 8;
  const paddedLength = (((source.length + 8) >>> 6) + 1) << 6;
  const buffer = new Uint8Array(paddedLength);
  buffer.set(source);
  buffer[source.length] = 0x80;

  const dataView = new DataView(buffer.buffer);
  dataView.setUint32(paddedLength - 8, bitLength >>> 0, true);
  dataView.setUint32(paddedLength - 4, Math.floor(bitLength / 0x1_0000_0000), true);

  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  for (let offset = 0; offset < paddedLength; offset += 64) {
    const chunk = new Uint32Array(16);

    for (let index = 0; index < 16; index += 1) {
      chunk[index] = dataView.getUint32(offset + index * 4, true);
    }

    const chunkA = a;
    const chunkB = b;
    const chunkC = c;
    const chunkD = d;

    for (let index = 0; index < 64; index += 1) {
      let mix = 0;
      let chunkIndex = 0;

      if (index < 16) {
        mix = (b & c) | (~b & d);
        chunkIndex = index;
      } else if (index < 32) {
        mix = (d & b) | (~d & c);
        chunkIndex = (index * 5 + 1) % 16;
      } else if (index < 48) {
        mix = b ^ c ^ d;
        chunkIndex = (index * 3 + 5) % 16;
      } else {
        mix = c ^ (b | ~d);
        chunkIndex = (index * 7) % 16;
      }

      const nextD = d;
      d = c;
      c = b;

      const mixed = (a + mix + MD5_TABLE[index] + chunk[chunkIndex]) >>> 0;
      b = (b + rotateLeft(mixed, MD5_SHIFT_AMOUNTS[index])) >>> 0;
      a = nextD;
    }

    a = (a + chunkA) >>> 0;
    b = (b + chunkB) >>> 0;
    c = (c + chunkC) >>> 0;
    d = (d + chunkD) >>> 0;
  }

  const output = new Uint8Array(16);
  const outputView = new DataView(output.buffer);
  outputView.setUint32(0, a, true);
  outputView.setUint32(4, b, true);
  outputView.setUint32(8, c, true);
  outputView.setUint32(12, d, true);

  return bytesToHex(output);
};
