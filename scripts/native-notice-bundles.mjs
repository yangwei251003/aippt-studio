import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

/** Extract the whole Licensing/License section, including the final section at EOF. */
export function extractReadmeLicenseSection(text) {
  const heading=/^#{1,6}[ \t]+[^\n]*\blicen[cs](?:e|ing)s?\b[^\n]*$/im.exec(text);
  if(!heading)return null;
  const bodyStart=heading.index+heading[0].length;
  const depth=/^#+/.exec(heading[0])[0].length;
  const nextHeading=new RegExp(`^#{1,${depth}}[ \\t]+`,'m').exec(text.slice(bodyStart));
  return text.slice(heading.index,nextHeading?bodyStart+nextHeading.index:text.length).trim();
}

const bundles=new Map([
  ['@img/sharp-libvips-linux-x64@1.3.3','sharp-libvips-1.3.3'],
  ['@img/sharp-libvips-linux-x64@1.3.4','sharp-libvips-1.3.4'],
]);
const noticeFiles=[
  'PACKAGE-README.md',
  'BUILD-THIRD-PARTY-NOTICES.md',
  'libvips-COPYRIGHT-NOTICE.txt',
  'libvips-LICENSE-2.1.txt',
  'LGPL-3.0.txt',
  'GPL-3.0.txt',
  'MPL-2.0.txt',
  'BUILD-LICENSE-Apache-2.0.txt',
  'UPSTREAM.md',
  'VERSIONS.json',
];

/** Preserve actual native-library terms; packaging Apache does not replace LGPL. */
export function collectNativeNotices(dependency,projectRoot) {
  const identity=`${dependency.name}@${dependency.version}`;
  const bundleName=bundles.get(identity);
  if(!bundleName){
    if(dependency.name.startsWith('@img/sharp-libvips-')&&dependency.bundledNoticeCount===0)
      throw new Error(`No verified native notice bundle for ${identity}; review its exact upstream package`);
    return [];
  }
  const directory=join(projectRoot,'licenses','upstream',bundleName);
  const metadata=JSON.parse(readFileSync(join(directory,'SOURCES.json'),'utf8'));
  if(metadata.identity!==identity||metadata.declaredLicense!==dependency.license)
    throw new Error(`Native notice identity/license mismatch for ${identity}`);
  const versions=readFileSync(join(dependency.packagePath,'versions.json'));
  if(createHash('sha256').update(versions).digest('hex')!==metadata.versionsSha256)
    throw new Error(`Native component versions changed for ${identity}; review notices before publishing`);
  return noticeFiles.map(name=>({
    name:`VERIFIED-UPSTREAM:${bundleName}/${name}`,
    text:readFileSync(join(directory,name),'utf8').replace(/\r\n/g,'\n').trim(),
  }));
}
