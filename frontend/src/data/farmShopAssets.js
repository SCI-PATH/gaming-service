/**
 * Farm shop challenge art — user stall + customer sprite sheets.
 */
/** Stall and counter art for the physical farm shop. */
export const FARM_SHOP_TEXTURES = [
  { textureKey: 'fshop_stall', image: '/assets/farm-shop/stall.png' },
  { textureKey: 'fshop_counter', image: '/assets/farm-shop/counter.png' },
  { textureKey: 'fshop_counter_bar', image: '/assets/farm-shop/counter_bar.png' },
];

/** Side-profile queue customers — trimmed 4×4 grid, 16 variants. */
export const FARM_SHOP_CUSTOMER_SHEET = {
  textureKey: 'fshop_customers_side',
  image: '/assets/farm-shop/customers_side_trim.png',
  frameWidth: 130,
  frameHeight: 139,
  frameCount: 16,
};

/** Front-facing extras — 6×6 grid, 36 variants (fallback pool). */
export const FARM_SHOP_CUSTOMER_SHEET_FRONT = {
  textureKey: 'fshop_customers_front',
  image: '/assets/farm-shop/customers_front.png',
  frameWidth: 114,
  frameHeight: 171,
  frameCount: 36,
};

/** Both customer sheets, loaded together with the stall textures. */
export const FARM_SHOP_SPRITESHEETS = [
  FARM_SHOP_CUSTOMER_SHEET,
  FARM_SHOP_CUSTOMER_SHEET_FRONT,
];

/** Everything Phaser preloads before a customer queue can appear. */
export const FARM_SHOP_LOAD_ITEMS = [
  ...FARM_SHOP_TEXTURES,
  ...FARM_SHOP_SPRITESHEETS,
];
