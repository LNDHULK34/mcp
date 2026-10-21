const MD_EXT_REGEX = /\.(md|mdx|mdc|markdown)$/i;
const IGNORED_PARTS = new Set(['.git', 'node_modules', '__MACOSX', 'dist', 'build', '.next']);

function shouldReadPath(relPath) {
  const parts = String(relPath || '').replace(/\\/g, '/').split('/');
  if (parts.some((p) => IGNORED_PARTS.has(p))) return false;
  return MD_EXT_REGEX.test(relPath);
}

function readAllDirectoryEntries(dirReader) {
  return new Promise((resolve, reject) => {
    const all = [];
    const readBatch = () => {
      dirReader.readEntries(
        (batch) => {
          if (!batch || batch.length === 0) {
            resolve(all);
          } else {
            all.push(...batch);
            readBatch();
          }
        },
        (err) => reject(err)
      );
    };
    readBatch();
  });
}

function readFileEntry(fileEntry) {
  return new Promise((resolve, reject) => {
    fileEntry.file(resolve, reject);
  });
}

async function traverseEntry(entry, prefix = '') {
  if (!entry) return [];
  const currentPath = prefix ? `${prefix}/${entry.name}` : entry.name;

  if (entry.isFile) {
    if (!shouldReadPath(currentPath)) return [];
    const file = await readFileEntry(entry);
    const content = await file.text();
    return [{ path: currentPath, content, size: file.size }];
  }

  if (entry.isDirectory) {
    if (IGNORED_PARTS.has(entry.name)) return [];
    const reader = entry.createReader();
    const children = await readAllDirectoryEntries(reader);
    const results = [];
    for (const child of children) {
      const sub = await traverseEntry(child, currentPath);
      results.push(...sub);
    }
    return results;
  }

  return [];
}

export async function readDroppedItems(dataTransfer) {
  const items = Array.from(dataTransfer?.items || []);
  const entries = items
    .map((item) => (typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null))
    .filter(Boolean);

  if (entries.length > 0) {
    const collected = [];
    for (const entry of entries) {
      const sub = await traverseEntry(entry, '');
      collected.push(...sub);
    }
    return {
      files: collected,
      rootLabel: entries.length === 1 ? entries[0].name : `${entries.length} dropped items`,
    };
  }

  return readFileList(dataTransfer?.files || []);
}

export async function readFileList(fileList) {
  const rawFiles = Array.from(fileList || []);
  const collected = [];
  let topFolder = '';

  for (const file of rawFiles) {
    const relPath = file.webkitRelativePath || file.name;
    if (!topFolder && file.webkitRelativePath) {
      topFolder = file.webkitRelativePath.split('/')[0] || '';
    }
    if (!shouldReadPath(relPath)) continue;
    const content = await file.text();
    collected.push({
      path: relPath,
      content,
      size: file.size,
    });
  }

  return {
    files: collected,
    rootLabel: topFolder || (collected.length === 1 ? collected[0].path : `${collected.length} Markdown files`),
  };
}
