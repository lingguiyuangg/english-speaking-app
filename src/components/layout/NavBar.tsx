'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavBar() {
  const pathname = usePathname();

  const links = [
    { href: '/', label: '首页', icon: '🏠' },
    { href: '/practice', label: '练习', icon: '💬' },
    { href: '/word-bank', label: '词库', icon: '📖' },
    { href: '/review', label: '复习', icon: '📝' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
      <div className="max-w-lg mx-auto flex justify-around items-center h-14">
        {links.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex flex-col items-center justify-center px-3 py-1 text-xs ${
                isActive ? 'text-blue-600' : 'text-gray-500'
              }`}
            >
              <span className="text-lg">{link.icon}</span>
              <span className="mt-0.5">{link.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
