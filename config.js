// =============================================================================
// KEY DATA  (from ohm-layouts.dtsi)
// Units: mm — real-world key centre positions from Fusion 360 (X, Z axes).
// Right half is mirrored from the left half across X = 0.
// The two halves are angled 20° apart (10° each side) — already baked into
// the coordinates below, so no additional rotation is applied.
// =============================================================================
const KEYS_RAW = [
  // id      x         y       — Left row 0  (Q W E R T)
  [  0,  -91.060,  -10.503],
  [  1,  -72.411,  -12.037],
  [  2,  -54.169,  -11.258],
  [  3,  -36.760,   -5.751],
  [  4,  -19.352,   -0.245],
  // Right row 0  (Y U I O P) — mirrored, inner→outer
  [  5,   19.352,   -0.245],
  [  6,   36.760,   -5.751],
  [  7,   54.169,  -11.258],
  [  8,   72.411,  -12.037],
  [  9,   91.060,  -10.503],
  // Left row 1  (A S D F G)
  [ 10,  -94.030,    6.338],
  [ 11,  -75.380,    4.803],
  [ 12,  -57.138,    5.582],
  [ 13,  -39.730,   11.089],
  [ 14,  -22.322,   16.595],
  // Right row 1  (H J K L ;)
  [ 15,   22.322,   16.595],
  [ 16,   39.730,   11.089],
  [ 17,   57.138,    5.582],
  [ 18,   75.380,    4.803],
  [ 19,   94.030,    6.338],
  // Left row 2  (Z X C V B)
  [ 20,  -96.999,   23.178],
  [ 21,  -78.349,   21.643],
  [ 22,  -60.107,   22.423],
  [ 23,  -42.699,   27.929],
  [ 24,  -25.291,   33.436],
  // Right row 2  (N M , . ')
  [ 25,   25.291,   33.436],
  [ 26,   42.699,   27.929],
  [ 27,   60.107,   22.423],
  [ 28,   78.349,   21.643],
  [ 29,   96.999,   23.178],
  // Left thumb
  [ 30,  -45.669,   44.769],
  [ 31,  -28.260,   50.276],
  [ 32,  -10.852,   55.782],
  // Right thumb
  [ 33,   10.852,   55.782],
  [ 34,   28.260,   50.276],
  [ 35,   45.669,   44.769],
];

// =============================================================================
// CONSTANTS
// =============================================================================
const ENGRAVABLE  = 14.7;   // mm — square engravable area per keycap
const KEY_PITCH   = 18.1;   // mm — nominal key pitch (for px/mm conversion)
const MM_TO_PX    = 52 / KEY_PITCH; // ≈ 2.87 px per mm (keeps same visual key size)

// Engraving grid — used by buildEngraveSVG only (not the keyboard GUI).
// Keys are placed sequentially in a rectangular grid on the engraving table.
const GRID_COLS   = 6;
const GRID_ROWS   = 6;
const GRID_PITCH  = 18.1;   // mm — center-to-center spacing on the engraving table

// QWERTY labels for keys 0-29 (left then right per row, thumb keys 30-35 unlabeled)
const QWERTY_LABELS = [
  'q','w','e','r','t',  // 0-4:  left row 0
  'y','u','i','o','p',  // 5-9:  right row 0
  'a','s','d','f','g',  // 10-14: left row 1
  'h','j','k','l',';',  // 15-19: right row 1
  'z','x','c','v','b',  // 20-24: left row 2
  'n','m',',','.',`'`,  // 25-29: right row 2
];

const KEY_DISP_PX = KEY_PITCH * MM_TO_PX; // ≈ 52px display size per key
const KEY_PAD     = 3;                     // px gap between keys
