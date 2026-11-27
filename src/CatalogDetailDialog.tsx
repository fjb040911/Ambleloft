import type {ReactNode} from 'react';
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from './components/ui/dialog';
import {Button} from './components/ui/button';
import {t} from './i18n';
import './catalog-detail-dialog.css';

type Props = {
  title: string;
  description: string;
  headingExtra?: ReactNode;
  children: ReactNode;
  actions: ReactNode;
  returnFocus?: HTMLElement | null | false;
  pending?: boolean;
  onClose(): void;
};

export default function CatalogDetailDialog({title, description, headingExtra, children, actions, returnFocus, pending, onClose}: Props) {
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}>
    <DialogContent className="wf-dialog wf-role-detail sm:max-w-[760px] p-6 flex" finalFocus={returnFocus === false ? false : returnFocus ? {current: returnFocus} : undefined}>
      <DialogHeader>
        {headingExtra}
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <div className="wf-role-detail-body">{children}</div>
      <DialogFooter>
        <Button variant="outline" disabled={pending} onClick={onClose}>{t('关闭')}</Button>
        {actions}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
