"""Package only explicitly public static showcase files, never application state."""
from pathlib import Path
import argparse,shutil
root=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--out',type=Path,default=Path('_site'));a=p.parse_args();out=a.out.resolve()
if out.exists() and any(out.iterdir()):p.error('Refusing to overwrite a nonempty directory')
out.mkdir(parents=True,exist_ok=True);(out/'images').mkdir(exist_ok=True)
for name in ['index.html','style.css','gallery.js']:shutil.copyfile(root/'site'/name,out/name)
for name in ['home','editor','resources']:shutil.copyfile(root/'docs/images'/f'{name}-fixture.png',out/'images'/f'{name}-fixture.png')
(out/'.nojekyll').touch();print('Built read-only screenshot showcase; no API/model/account data packaged')
