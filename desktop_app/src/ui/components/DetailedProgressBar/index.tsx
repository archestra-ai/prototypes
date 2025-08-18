import React from 'react';

import { Progress } from '@ui/components/ui/progress';

interface DetailedProgressBarProps {
  icon: React.JSX.Element;
  title: string;
  description: string | null;
  /**
   * `percentage` should be a number greater than 0 and less than 100
   */
  percentage: number;
  error: string | null;
}

const DetailedProgressBar = ({ icon, title, description, percentage, error }: DetailedProgressBarProps) => (
  <div className="w-full space-y-3 p-3 border rounded-lg bg-card">
    <div className="flex items-center gap-3">
      {icon}
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
    </div>
    {percentage > 0 && percentage < 100 && (
      <div className="space-y-1">
        <Progress value={percentage} className="w-full h-2" />
        <p className="text-xs text-muted-foreground text-right">{Math.floor(percentage)}%</p>
      </div>
    )}
    {error && (
      <div className="rounded-md bg-destructive/10 p-3">
        <p className="text-sm text-destructive">Please check the logs for more information about the failure.</p>
      </div>
    )}
  </div>
);

export default DetailedProgressBar;
