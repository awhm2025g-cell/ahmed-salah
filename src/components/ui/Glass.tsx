/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { cn } from '../../lib/utils';
import { motion, HTMLMotionProps } from 'motion/react';

interface GlassCardProps extends HTMLMotionProps<"div"> {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export const GlassCard: React.FC<GlassCardProps> = ({ 
  children, 
  className, 
  hover = true,
  ...props 
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={hover ? { y: -5, transition: { duration: 0.2 } } : undefined}
      className={cn(
        "relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg shadow-2xl",
        "before:absolute before:inset-0 before:-z-10 before:bg-gradient-to-br before:from-white/5 before:to-transparent",
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
};

export const GlassButton: React.FC<HTMLMotionProps<"button">> = ({ 
  children, 
  className, 
  ...props 
}) => {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "relative rounded-xl bg-gradient-to-l from-blue-600 to-indigo-600 px-6 py-3 font-bold text-white shadow-lg shadow-blue-900/40 transition-all hover:brightness-110 disabled:opacity-50 min-h-[44px] flex items-center justify-center",
        className
      )}
      {...props}
    >
      {children}
    </motion.button>
  );
};

export const LiquidBackground: React.FC = () => {
  return (
    <div className="fixed inset-0 -z-50 overflow-hidden bg-[#0f172a]">
      <div className="absolute top-[-10%] left-[-10%] h-[500px] w-[500px] rounded-full bg-blue-600/30 blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[10%] h-[600px] w-[600px] rounded-full bg-purple-600/20 blur-[150px]" />
      <div className="absolute top-[30%] right-[20%] h-[400px] w-[400px] rounded-full bg-indigo-600/10 blur-[100px]" />
    </div>
  );
};
