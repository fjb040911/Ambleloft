import {useState} from 'react';
import {ExternalLink,GitFork,UserRound} from 'lucide-react';
import type {StoreListing} from './types';
import {t,useLanguage} from './i18n';
import legacyDescriptions from '../core/catalog-store/legacy-skill-descriptions.json';
import legacyStars from '../core/catalog-store/legacy-repository-stars.json';

type Repository = Partial<NonNullable<StoreListing['repository']>> & {url:string};
type Props = Pick<StoreListing,'contentSource'> & {repository?:Repository; publisher?:string; packageDigest?:string; fallback?:string; compact?:boolean; kind?:'skill'|'extension'};

// These older releases predate contentSource. Match verified package contents, not a publisher name.
const firstPartyPackages = new Set([
  'baa5f49413d568d677d38c08a4f073b0fc1905fc5d12a4415526300dc1cc70b8', // WeKnora
  '8025e1aae929cb389c95f1a60348f342a90e1c3a08b9da32474adc6bab165b96', // AI work log
  '2459797fa92d1e3ed98cfcb9e8ae12ef054675a284cf90bb6758fdd6add5ddca', // ai-rules
]);

function githubRepository(url?:string) {
  const match = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)\/?$/.exec(url || '');
  if (!match) return;
  const parts = [match[1], match[2].replace(/\.git$/, '')];
  if (parts.every(part => part && part !== '.' && part !== '..')) return parts.join('/');
}

function originalFile(root:string, repository:Repository, kind:'skill'|'extension') {
  if (!/^[a-f\d]{40}$/i.test(repository.commit || '') || typeof repository.directory !== 'string') return;
  const directory = repository.directory.split('/').filter(Boolean);
  if (directory.some(part => part === '.' || part === '..' || part.includes('\\'))) return;
  const suffix = kind === 'skill' ? ['SKILL.md'] : [];
  return [root, kind === 'skill' ? 'blob' : 'tree', repository.commit, ...directory.map(encodeURIComponent), ...suffix].join('/');
}

function snapshot(repository:Repository) {
  const {stars,starsObservedAt} = repository;
  if (typeof stars !== 'number' || !Number.isSafeInteger(stars) || stars < 0 || !starsObservedAt) return;
  const date = new Date(starsObservedAt);
  if (Number.isFinite(date.getTime())) return {stars,date};
}

export default function ContentSourceInfo({contentSource,repository,publisher,packageDigest,fallback,compact=false,kind='skill'}:Props) {
  const language = useLanguage();
  const [error,setError] = useState('');
  if (!contentSource && !repository && packageDigest && firstPartyPackages.has(packageDigest)) {
    contentSource = {kind:'store',name:'Ambleloft Store',developer:'Ambleloft'};
  }
  const name = githubRepository(repository?.url);
  if (compact) {
    const developer = contentSource?.kind === 'store' ? contentSource.developer : undefined;
    const label = developer || name;
    if (!label) return null;
    const hint = (developer ? t('开发者') : 'GitHub')+' · '+label;
    const Icon = developer ? UserRound : GitFork;
    return <span className="store-card-source" title={hint}><Icon aria-hidden="true"/><span><span className="sr-only">{developer ? t('开发者') : 'GitHub'} · </span>{label}</span></span>;
  }
  if (contentSource?.kind === 'store') {
    return <div className="content-origin"><strong>{contentSource.name}</strong><span>{t('开发者')} · {contentSource.developer}</span></div>;
  }
  if (!name || !repository) return <span>{publisher ? t('发布方')+' · '+publisher : fallback || t('未记录内容来源')}</span>;

  const root = 'https://github.com/'+name;
  const file = originalFile(root,repository,kind);
  const description = contentSource?.originalDescription || (file && (legacyDescriptions as Record<string,string>)[file]);
  const archived = (legacyStars as Record<string,Pick<Repository,'stars'|'starsObservedAt'>>)[root];
  const observed = snapshot(repository) || (archived && snapshot({url:root,...archived}));
  function link(url:string,label:string,ariaLabel?:string) {
    return <a href={url} aria-label={ariaLabel} target="_blank" rel="noopener noreferrer" onClick={event=>{
      if (!window.desktop) return;
      event.preventDefault();
      setError('');
      void window.desktop.openLink(url).catch(()=>setError(t('无法打开链接，请重试。')));
    }}>{label}<ExternalLink size={13} aria-hidden="true"/></a>;
  }
  return <div className="content-origin">
    <div className="content-origin-links">{link(root,'GitHub · '+name,t('在 GitHub 打开'))}
      {observed && <small>{observed.stars.toLocaleString(language)} Stars · {t('采集于')} <time dateTime={observed.date.toISOString()}>{observed.date.toLocaleDateString(language)}</time></small>}
    </div>
    {description && <p><strong>{t('原文介绍')}</strong> {description}</p>}
    {file && link(file,t(kind === 'skill' ? '查看技能原文' : '查看扩展源码'))}
    {error && <small role="alert">{error}</small>}
  </div>;
}
