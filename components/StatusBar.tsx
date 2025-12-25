import React, { useState, useEffect } from 'react';

const StatusBar: React.FC = () => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timerId = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timerId);
  }, []);

  const formattedDateTime = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(currentTime);

  return (
    <div className="h-6 bg-[var(--surface)] border-t border-[var(--outline)] px-4 flex items-center justify-between text-xs text-[var(--on-surface-variant)] transition-colors duration-300">
      <span>جاهز</span>
      <span className="font-mono">{formattedDateTime}</span>
      <span>الإصدار 1.0.0</span>
    </div>
  );
};

export default StatusBar;