import React from 'react';

import { TypewriterText } from '@/components/TypewriterText';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

interface BreadcrumbsProps {
  breadcrumbs: string[];
  isAnimatedTitle?: boolean;
}

export function Breadcrumbs({ breadcrumbs, isAnimatedTitle }: BreadcrumbsProps) {
  return (
    <Breadcrumb className="hidden sm:block">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink>Archestra</BreadcrumbLink>
        </BreadcrumbItem>
        {breadcrumbs.map((breadcrumb, index) => (
          <React.Fragment key={`sep-${index}`}>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {index === breadcrumbs.length - 1 ? (
                <BreadcrumbPage>
                  {isAnimatedTitle && index === 1 ? <TypewriterText text={breadcrumb} /> : breadcrumb}
                </BreadcrumbPage>
              ) : (
                <BreadcrumbLink>{breadcrumb}</BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
