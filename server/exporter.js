import JSZip from 'jszip';

export async function createSkillsZipBuffer(skills, rootFolder = 'skills') {
  const zip = new JSZip();
  const base = rootFolder ? zip.folder(rootFolder) : zip;

  for (const skill of skills) {
    const folder = base.folder(skill.slug);
    folder.file('SKILL.md', skill.content || '');
    for (const ref of skill.references || []) {
      const cleanRel = String(ref.path || '').replace(/^\/+/, '');
      if (cleanRel) {
        folder.file(cleanRel, ref.content || '');
      }
    }
  }

  const readmeLines = [
    '# Exported SkillVault Bundle',
    '',
    `Exported ${skills.length} skill(s) on ${new Date().toISOString()}.`,
    '',
    '## Included Skills',
    '',
    ...skills.map(
      (s) => `- **${s.name}** (\`${s.slug}/SKILL.md\`) — ${s.description || 'No description'}`
    ),
    '',
  ];
  base.file('README.md', readmeLines.join('\n'));

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
