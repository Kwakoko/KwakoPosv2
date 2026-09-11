import React from 'react';

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className = '', ...props }) => (
  <div className={`bg-white dark:bg-darkbg-card rounded-xl border border-slate-200 dark:border-darkbg-border shadow-sm overflow-hidden ${className}`} {...props}>
    {children}
  </div>
);

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className = '', ...props }) => (
  <div className={`p-5 flex flex-col space-y-1.5 border-b border-slate-100 dark:border-darkbg-border/30 ${className}`} {...props}>
    {children}
  </div>
);

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({ children, className = '', ...props }) => (
  <h3 className={`text-base font-semibold leading-none tracking-tight text-slate-900 dark:text-white ${className}`} {...props}>
    {children}
  </h3>
);

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({ children, className = '', ...props }) => (
  <p className={`text-xs text-slate-500 dark:text-slate-400 ${className}`} {...props}>
    {children}
  </p>
);

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className = '', ...props }) => (
  <div className={`p-5 ${className}`} {...props}>
    {children}
  </div>
);

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className = '', ...props }) => (
  <div className={`p-5 border-t border-slate-100 dark:border-darkbg-border/30 flex items-center justify-end ${className}`} {...props}>
    {children}
  </div>
);
