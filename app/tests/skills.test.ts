import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { SKILL_IDS, castPlan, planMs, type BakedSkill } from '../src/lib/skills';

const PUBLIC = join(import.meta.dirname, '..', 'public');
const manifest: Record<string, BakedSkill> = JSON.parse(readFileSync(join(PUBLIC, 'sprites/skills/skills.json'), 'utf8'));
const WEAPON_ATTACKS = ['swingO1', 'stabO1', 'swingT1', 'shoot1', 'shoot2'];

test('every skill id is baked with sequences and existing images', () => {
  for (const id of SKILL_IDS) {
    const skill = manifest[id];
    assert.ok(skill, `${id} missing from skills.json`);
    assert.ok(skill.name, `${id} has no name`);
    assert.ok(existsSync(join(PUBLIC, skill.icon)), `${id} icon`);
    assert.ok(Object.keys(skill.sequences).length > 0, `${id} has no sequences`);
    for (const frame of Object.values(skill.sequences).flat()) assert.ok(existsSync(join(PUBLIC, frame.image)), frame.image);
  }
});

test('castPlan is well-formed for every skill and weapon attack', () => {
  for (const id of SKILL_IDS) {
    for (const attack of WEAPON_ATTACKS) {
      const plan = castPlan(manifest[id]!, attack);
      assert.ok(planMs(plan) > 0, `${id}/${attack} planMs`);
      assert.ok(plan.poses.length > 0, `${id}/${attack} poses`);
      for (const cue of plan.effects) assert.ok(cue.frames.length > 0, `${id}/${attack} empty effect cue`);
      for (const cue of plan.projectiles) {
        assert.ok(cue.ms > 0, `${id} projectile ms`);
        assert.ok(existsSync(join(PUBLIC, cue.image)), `${id} projectile image`);
      }
    }
  }
});

test('bow skills use a shoot pose even when the worn weapon is not a bow', () => {
  for (const id of ['3101005', '3111003', '3201004'] as const) {
    const plan = castPlan(manifest[id]!, 'swingO1');
    assert.ok(plan.poses.every((phase) => phase.anim.startsWith('shoot')), id);
    assert.ok(plan.effects.some((cue) => cue.at > 0 && cue.x < 0 && cue.frames.length === 1), `${id} arrow in flight`);
  }
  assert.equal(castPlan(manifest['3201004']!, 'swingO1').poses[0]!.anim, 'shoot2');
});
