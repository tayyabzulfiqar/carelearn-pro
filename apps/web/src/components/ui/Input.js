import { clsx } from 'clsx';
import { forwardRef } from 'react';

const Input = forwardRef(({ label, error, className, ...props }, ref) => (
  <div className="flex flex-col gap-1">
    {label && (
      <label className="text-sm font-medium text-gray-700">{label}</label>
    )}
    <input
      ref={ref}
      className={clsx(
        'w-full px-3 py-2.5 rounded-lg border text-sm transition-all duration-150',
        'bg-white text-gray-900 placeholder-gray-400',
        'focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-transparent',
        error
          ? 'border-red-400 focus:ring-red-400'
          : 'border-gray-300 hover:border-gray-400',
        className
      )}
      {...props}
    />
    {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
  </div>
));
Input.displayName = 'Input';
export default Input;
