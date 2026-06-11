'use client';

import React from 'react';

interface LegalDocLayoutProps {
  title: string;
  updatedLabel?: string;
  children: React.ReactNode;
}

/**
 * Shared wrapper for legal/policy pages (Terms, Privacy, Refund).
 * Provides consistent typography and spacing so the documents render
 * as clean, crawlable standalone pages.
 */
const LegalDocLayout: React.FC<LegalDocLayoutProps> = ({ title, updatedLabel, children }) => {
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">{title}</h1>
      {updatedLabel && <p className="text-sm text-gray-400 mb-8">{updatedLabel}</p>}
      <div
        className="
          space-y-4 text-[15px] leading-7 text-gray-700
          [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mt-8 [&_h2]:mb-2
          [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-gray-900 [&_h3]:mt-5 [&_h3]:mb-1
          [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1
          [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1
          [&_a]:text-blue-600 [&_a]:underline hover:[&_a]:text-blue-700
          [&_strong]:font-semibold [&_strong]:text-gray-900
        "
      >
        {children}
      </div>
    </main>
  );
};

export default LegalDocLayout;
