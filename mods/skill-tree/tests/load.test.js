// Exercise the real loader against temporary skill folders, with Herdr's I/O adapted to Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'skill-tree-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = (await readFile(new URL('../load.js', import.meta.url), 'utf8'))
    .replace('import { exec, readTextFile, home, agents, panes } from "herdr";', `
      import { readFile, access } from 'node:fs/promises';
      import { execFile } from 'node:child_process';
      const home = () => ${JSON.stringify(root)};
      const agents = () => [];
      const panes = () => [];
      const readTextFile = (p) => readFile(p, 'utf8');
      const exec = (cmd, args, options) => new Promise((resolve) =>
        execFile(cmd, args, options, (error, stdout) => resolve({ code: error ? 1 : 0, stdout })));
      const exists = async (p) => { try { await access(p); return true; } catch { return false; } };
    `)
    .replace('import { readdir, exists } from "fs/promises";', 'import { readdir } from "node:fs/promises";')
    .replace('"./model.js"', JSON.stringify(new URL('../model.js', import.meta.url).href));
  const loader = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const skill = async (rel, description = 'Shared skill.') => {
    const path = join(root, rel);
    await mkdir(path, { recursive: true });
    await writeFile(join(path, 'SKILL.md'), `---\nname: ${rel.split('/').pop()}\ndescription: ${description}\n---\n`);
    return path;
  };
  return { root, loader, skill };
}

const skills = (tree) => tree.groups.flatMap((g) => g.skills);

test('Global includes shared symlinked skills once, with Claude paths winning collisions', async (t) => {
  const { root, loader, skill } = await fixture(t);
  const ready = await skill('source/tripo-ready');
  await mkdir(join(root, '.agents/skills'), { recursive: true });
  await symlink(ready, join(root, '.agents/skills/tripo-ready'));
  await skill('.agents/skills/tripo-game');
  await skill('.agents/skills/duplicate', 'Shared copy.');
  const claude = await skill('.claude/skills/duplicate', 'Claude copy.');
  const rows = skills(await loader.loadGlobalTree(null));
  assert.deepEqual(rows.map((s) => s.name), ['duplicate', 'tripo-game', 'tripo-ready']);
  assert.equal(rows.find((s) => s.name === 'tripo-ready').path, ready);
  assert.equal(rows[0].path, claude);
  assert.equal(rows[0].description, 'Claude copy.');
  const info = await loader.loadInfo(rows.find((s) => s.name === 'tripo-ready'), null);
  assert.ok(info.source.some(([k, v]) => k === 'Linked from' && v === join(root, '.agents/skills/tripo-ready')));
  assert.match(info.scope, /shared skills folder/i);
  assert.ok(!JSON.stringify(info).includes('.claude/skills/tripo-ready'));
});

test('Agent view stays limited to its session listing', async (t) => {
  const { root, loader, skill } = await fixture(t);
  await skill('.agents/skills/tripo-ready');
  await skill('.claude/skills/loaded');
  const dir = join(root, '.claude/projects/-project');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'session.jsonl'), JSON.stringify({ attachment: {
    type: 'skill_listing', isInitial: true, names: ['loaded'], content: '- loaded: Loaded skill.',
  } }));
  assert.deepEqual(skills(await loader.loadAgentTree({ cwd: '/project', sessionId: 'session' })).map((s) => s.name), ['loaded']);
});

test('Global works when the shared folder is missing', async (t) => {
  const { loader, skill } = await fixture(t);
  await skill('.claude/skills/loaded');
  assert.deepEqual(skills(await loader.loadGlobalTree(null)).map((s) => s.name), ['loaded']);
});

test("Agent view adds the project's .agents skills in their own group", async (t) => {
  const { root, loader, skill } = await fixture(t);
  const cwd = join(root, 'proj');
  const shared = await skill('proj/.agents/skills/shared-skill', 'Shared in the project.');
  await skill('proj/.agents/skills/loaded', 'Shared copy.');
  const loaded = await skill('proj/.claude/skills/loaded', 'Claude copy.');
  const dir = join(root, '.claude/projects', cwd.replace(/[/.]/g, '-'));
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'session.jsonl'), JSON.stringify({ attachment: {
    type: 'skill_listing', isInitial: true, names: ['loaded'], content: '- loaded: Loaded skill.',
  } }));
  const tree = await loader.loadAgentTree({ cwd, sessionId: 'session' });
  assert.deepEqual(tree.groups.map((g) => [g.id, g.skills.map((s) => s.name)]),
    [['project', ['loaded']], ['shared', ['shared-skill']]]);
  assert.equal(tree.groups[0].skills[0].path, loaded);
  const row = tree.groups[1].skills[0];
  assert.equal(row.path, shared);
  assert.equal(row.description, 'Shared in the project.');
  const info = await loader.loadInfo(row, cwd);
  assert.equal(info.path, shared);
  assert.match(info.scope, /\.agents\/skills/);
  assert.match(info.scope, /Claude Code doesn't load/);
});

test("A Claude session with no skill list yet still shows the project's .agents skills", async (t) => {
  const { root, loader, skill } = await fixture(t);
  await skill('proj/.agents/skills/shared-skill');
  const tree = await loader.loadAgentTree({ cwd: join(root, 'proj'), sessionId: 'none' });
  assert.equal(tree.error, null);
  assert.deepEqual(tree.groups.map((g) => [g.id, g.skills.map((s) => s.name)]), [['shared', ['shared-skill']]]);
  assert.match((await loader.loadAgentTree({ cwd: join(root, 'empty'), sessionId: 'none' })).error, /No skill list/);
});

test('A non-Claude agent shows its project and personal .agents skills, project first', async (t) => {
  const { root, loader, skill } = await fixture(t);
  const project = await skill('proj/.agents/skills/shared-skill');
  await skill('proj/.agents/skills/both', 'Project copy.');
  await skill('.agents/skills/both', 'Personal copy.');
  await skill('.agents/skills/tripo-game');
  await skill('.claude/skills/claude-only');
  const tree = await loader.loadFolderTree({ cwd: join(root, 'proj') });
  assert.deepEqual(tree.groups.map((g) => [g.id, g.skills.map((s) => s.name)]),
    [['shared', ['both', 'shared-skill']], ['yours', ['tripo-game']]]);
  assert.equal(tree.groups[0].skills[1].path, project);
  assert.equal(tree.groups[0].skills[0].description, 'Project copy.');
  assert.match((await loader.loadFolderTree({ cwd: join(root, 'empty-home-too') })).groups[0].id, /yours/);
});
