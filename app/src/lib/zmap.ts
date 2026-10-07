// Official MapleStory Z-Index ordering (from CBT2 zmap)
// Elements earlier in this array are rendered BEHIND elements later in this array.

export const ZMAP_ORDER: string[] = [
  'backTamingMobMid',
  'backMobEquipUnderSaddle',
  'backSaddle',
  'backMobEquipMid',
  'backTamingMobFront',
  'backMobEquipFront',
  'weaponBelowBody',
  'hairBelowBody',
  'capeBelowBody',
  'shieldBelowBody',
  'capAccessoryBelowBody',
  'gloveBelowBody',
  'gloveWristBelowBody',
  'body',
  'gloveOverBody',
  'mailChestBelowPants',
  'pantsBelowShoes',
  'shoes',
  'pants',
  'mailChestOverPants',
  'shoesOverPants',
  'pantsOverShoesBelowMailChest',
  'shoesTop',
  'mailChest',
  'pantsOverMailChest',
  'mailChestOverHighest',
  'gloveWristOverBody',
  'mailChestTop',
  'weaponOverBody',
  'armBelowHead',
  'mailArmBelowHead',
  'armBelowHeadOverMailChest',
  'gloveBelowHead',
  'mailArmBelowHeadOverMailChest',
  'gloveWristBelowHead',
  'weaponOverArmBelowHead',
  'shield',
  'weapon',
  'arm',
  'glove',
  'mailArm',
  'gloveWrist',
  'cape',
  'head',
  'hairShade',
  'face',
  'accessoryEar',
  'accessoryEye',
  'capBelowAccessory',
  'capAccessoryBelowAccFace',
  'hair',
  'cap',
  'capAccessory',
  'hairOverHead',
  'capOverHair',
  'weaponBelowArm',
  'armOverHairBelowWeapon',
  'mailArmOverHairBelowWeapon',
  'armOverHair',
  'gloveBelowMailArm',
  'mailArmOverHair',
  'gloveWristBelowMailArm',
  'weaponOverArm',
  'gloveBelowWeapon',
  'gloveWristBelowWeapon',
  'shieldOverHair',
  'weaponOverHand',
  'gloveOverHair',
  'gloveWristOverHair',
  'weaponOverGlove',
  'capeOverHead',
  'weaponWristOverGlove',
  'characterStart',
];

const ZMAP_INDEX: Record<string, number> = {};
ZMAP_ORDER.forEach((layer, idx) => {
  ZMAP_INDEX[layer] = idx;
});

export function getZIndex(position: string): number {
  if (position in ZMAP_INDEX) return ZMAP_INDEX[position];
  // Fallbacks for composite or alias position names
  if (position.includes('BelowBody')) return 5;
  if (position.includes('OverHair')) return 50;
  if (position.includes('OverArm')) return 40;
  if (position.includes('Arm')) return 35;
  if (position.includes('Chest') || position.includes('mail')) return 15;
  if (position.includes('pants')) return 12;
  if (position.includes('shoes')) return 10;
  if (position.includes('cap')) return 45;
  if (position.includes('hair')) return 42;
  if (position.includes('face')) return 39;
  if (position.includes('weapon')) return 38;
  return 20;
}
