import type {ReactNode} from 'react';
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from './components/ui/card';

type Props = {
  title: ReactNode;
  description?: ReactNode;
  label?: string;
  children: ReactNode;
  actions?: ReactNode;
};

export default function ChatQuestionCard({title, description, label, children, actions}: Props) {
  return <Card role={label ? 'region' : undefined} aria-label={label}>
    <CardHeader>
      <CardTitle role="heading" aria-level={3}>{title}</CardTitle>
      {description && <CardDescription>{description}</CardDescription>}
    </CardHeader>
    <CardContent className="flex min-w-0 flex-col gap-4">{children}</CardContent>
    {actions && <CardFooter>{actions}</CardFooter>}
  </Card>;
}
