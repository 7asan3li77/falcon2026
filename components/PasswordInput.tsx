import React, { useState } from 'react';
import { EyeIcon, EyeOffIcon } from './Icons';

interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    containerClassName?: string;
}

const PasswordInput: React.FC<PasswordInputProps> = ({ className, containerClassName, ...props }) => {
    const [showPassword, setShowPassword] = useState(false);

    return (
        <div className={`relative ${containerClassName || ''}`}>
            <input
                type={showPassword ? 'text' : 'password'}
                className={`pl-10 ${className || ''}`}
                {...props}
            />
            <button
                type="button"
                onClick={() => setShowPassword(prev => !prev)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)] opacity-70 hover:opacity-100 transition-opacity"
                aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
            >
                {showPassword ? (
                    <EyeOffIcon className="h-5 w-5" />
                ) : (
                    <EyeIcon className="h-5 w-5" />
                )}
            </button>
        </div>
    );
};

export default PasswordInput;