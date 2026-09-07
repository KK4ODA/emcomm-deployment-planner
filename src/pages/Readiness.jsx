import React from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, CircleAlert, TriangleAlert, CircleCheck, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { Section } from '@/components/common/Section';
import { QueryState } from '@/components/common/QueryState';
import { DeploymentGate } from '@/components/common/DeploymentGate';
import { useCurrentDeployment } from '@/contexts/DeploymentContext';
import { useReadiness } from '@/features/readiness/useReadiness';
import { cn } from '@/lib/utils';

const STATE = {
  todo: { icon: CircleAlert, className: 'text-destructive', label: 'Fix' },
  warn: { icon: TriangleAlert, className: 'text-warning', label: 'Check' },
  ok: { icon: CircleCheck, className: 'text-success', label: 'Fine' },
};

/** /readiness: the plan's problems as a worklist, grouped, worst first. */
export default function Readiness() {
  return <DeploymentGate><ReadinessContent /></DeploymentGate>;
}

function ReadinessContent() {
  const { deployment } = useCurrentDeployment();
  const { result, queries } = useReadiness(deployment);
  return (
    <QueryState queries={queries}>
      {result && (
        <>
          <PageHeader
            icon={ClipboardCheck}
            eyebrow={deployment.name}
            title="Readiness"
            description={result.ready ? 'Nothing outstanding. Publish the plan and brief the net.' : 'What still stands between this plan and go time, worst first. Each line links to where it is fixed.'}
          />
          <div className="mb-4 grid grid-cols-3 gap-2">
            <StatCard label="To fix" value={result.todo} icon={CircleAlert} tone={result.todo ? 'critical' : 'success'} />
            <StatCard label="To check" value={result.warn} icon={TriangleAlert} tone={result.warn ? 'warning' : 'success'} />
            <StatCard label="Fine" value={result.ok} icon={CircleCheck} tone="success" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {result.groups.map(group => (
              <Section key={group.name} title={group.name} aside={`${group.items.filter(i => i.state !== 'ok').length} open`} bodyClassName="p-0">
                <ul className="divide-y">
                  {group.items.map(item => {
                    const meta = STATE[item.state];
                    const Icon = meta.icon;
                    return (
                      <li key={item.id} className={cn('flex items-start gap-3 px-3 py-2 text-sm', item.state === 'ok' && 'opacity-70')}>
                        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', meta.className)} aria-label={meta.label} />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{item.label}</p>
                          {item.detail && <p className="text-xs text-muted-foreground">{item.detail}</p>}
                        </div>
                        {item.to && item.state !== 'ok' && <Button asChild size="sm" variant="outline"><Link to={item.to}>{item.cta || 'Open'} <ArrowRight /></Link></Button>}
                      </li>
                    );
                  })}
                </ul>
              </Section>
            ))}
          </div>
        </>
      )}
    </QueryState>
  );
}
