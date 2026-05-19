'use client'

interface NumaAvatarProps {
  active?: boolean
  size?: number
}

export function NumaAvatar({ active = false, size = 36 }: NumaAvatarProps) {
  const ringClass = active
    ? 'ring-2 ring-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.35)]'
    : 'ring-1 ring-neutral-700'
  return (
    <div
      className={
        'relative flex shrink-0 items-center justify-center self-end overflow-hidden rounded-full bg-neutral-900 numa-bob ' +
        ringClass +
        (active ? ' numa-bob-fast' : '')
      }
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg
        viewBox="0 0 150 150"
        width={size - 8}
        height={size - 8}
        xmlns="http://www.w3.org/2000/svg"
      >
        <g className={active ? 'numa-tilt-active' : 'numa-tilt'}>
          <path
            fill="#fff"
            d="M15.8 64.4 C19.9 39.1 42.9 13.8 75 13.8 C106.1 13.8 129.5 37.1 134.3 64.0 L126.5 108.5 C114.8 127.5 96.8 137.2 75 137.2 C47.9 137.2 32.6 122.3 23.7 107.5 Z"
          />
          <path
            fill="none"
            stroke="#0a0a0a"
            strokeWidth="2.8346"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m15.8 64.4c4.1-25.3 27.1-50.6 59.2-50.6 31.1 0 54.5 23.3 59.3 50.2"
          />
          <path
            fill="none"
            stroke="#0a0a0a"
            strokeWidth="2.8346"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m23.7 107.5c8.9 13.9 24.2 28.8 51.3 28.8 21.8 0 39.8-9.7 51.5-28.7"
          />
          <path
            fill="#fff"
            stroke="#0a0a0a"
            strokeWidth="2.8346"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m28.3 58.4-14.7 6.9-10.2 42.2 14.9-9.3-1.5 14.7c5.3-4 18.8-13.8 18.8-32.9 0-10.3-4.9-18.2-7.3-21.6z"
            className={active ? 'numa-ear-l-active' : 'numa-ear-l'}
            style={{ transformOrigin: '28px 80px' }}
          />
          <path
            fill="#fff"
            stroke="#0a0a0a"
            strokeWidth="2.8346"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m121.8 58.4 14.7 6.9 10.1 42.2-14.5-9.3 1.2 14.7c-5.3-4-18.5-12.7-18.5-32.9 0-10.3 4.6-17.7 7-21.6z"
            className={active ? 'numa-ear-r-active' : 'numa-ear-r'}
            style={{ transformOrigin: '122px 80px' }}
          />
          <path
            fill="#0a0a0a"
            d="m75.2 71.8c-3.3 0.1-5.5 1-7.3 2.4-0.5 0.5-0.9 1.2-0.3 2.4l5.9 11.1c0.8 1.5 2.4 1.5 3 0l5.6-11.1c0.5-1 0.4-1.8-0.3-2.4-1.7-1.5-4-2.4-6.6-2.4z"
          />
          <g className="numa-eye numa-eye-r" style={{ transformOrigin: '95px 62px' }}>
            <path
              fill="#0a0a0a"
              d="m94.8 50.1c-6.1 0-11.7 4.7-11.7 11.9 0.3 6.6 5 11.8 11.8 11.8 6.9 0 11.4-5.4 11.4-11.5 0-5.9-5-12.2-11.5-12.2zm3.7 11.2c-1.5 0-2.9-1.3-2.9-2.9 0-1.4 1.2-2.9 2.9-2.9 1.6 0 2.8 1.2 2.8 2.9 0 1.6-1.3 2.9-2.8 2.9z"
            />
          </g>
          <g className="numa-eye numa-eye-l" style={{ transformOrigin: '55px 62px' }}>
            <path
              fill="#0a0a0a"
              d="m55.4 50.1c-5.7 0.2-11.8 4.6-11.8 12 0.1 5.5 4.3 11.7 11.8 11.7 6.3 0 11.3-4.9 11.3-11.3 0.1-6.1-5-12.4-11.3-12.4zm3.5 11.2c-1.5 0-2.8-1.3-2.8-2.9s1.2-2.9 2.8-2.9c1.5 0 2.9 1.2 2.9 2.9 0 1.6-1.4 2.9-2.9 2.9z"
            />
          </g>
        </g>
        {active ? (
          <>
            <circle cx="20" cy="20" r="2" fill="#34d399" className="numa-spark numa-spark-1" />
            <circle cx="130" cy="22" r="1.6" fill="#34d399" className="numa-spark numa-spark-2" />
            <circle cx="128" cy="120" r="1.8" fill="#34d399" className="numa-spark numa-spark-3" />
          </>
        ) : null}
      </svg>
      <style jsx>{`
        .numa-bob {
          animation: numa-bob 3.2s ease-in-out infinite;
        }
        .numa-bob-fast {
          animation: numa-bob 1.4s ease-in-out infinite;
        }
        @keyframes numa-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
      `}</style>
      <style jsx global>{`
        .numa-eye {
          animation: numa-blink 4.2s ease-in-out infinite;
        }
        .numa-eye-r {
          animation-delay: 0.04s;
        }
        @keyframes numa-blink {
          0%, 92%, 100% { transform: scaleY(1); }
          95% { transform: scaleY(0.08); }
          97% { transform: scaleY(1); }
        }
        .numa-tilt {
          animation: numa-tilt 5.4s ease-in-out infinite;
          transform-origin: 75px 95px;
        }
        .numa-tilt-active {
          animation: numa-tilt-active 1.6s ease-in-out infinite;
          transform-origin: 75px 95px;
        }
        @keyframes numa-tilt {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(2deg); }
        }
        @keyframes numa-tilt-active {
          0%, 100% { transform: rotate(-3deg); }
          50% { transform: rotate(3deg); }
        }
        .numa-ear-l, .numa-ear-r {
          animation: numa-ear 4.8s ease-in-out infinite;
        }
        .numa-ear-r {
          animation-delay: 0.6s;
        }
        .numa-ear-l-active, .numa-ear-r-active {
          animation: numa-ear-active 1.1s ease-in-out infinite;
        }
        .numa-ear-r-active {
          animation-delay: 0.2s;
        }
        @keyframes numa-ear {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(-4deg); }
        }
        @keyframes numa-ear-active {
          0%, 100% { transform: rotate(-6deg); }
          50% { transform: rotate(8deg); }
        }
        .numa-spark {
          opacity: 0;
          animation: numa-spark 1.8s ease-in-out infinite;
        }
        .numa-spark-1 { animation-delay: 0s; }
        .numa-spark-2 { animation-delay: 0.6s; }
        .numa-spark-3 { animation-delay: 1.2s; }
        @keyframes numa-spark {
          0%, 100% { opacity: 0; transform: scale(0.6); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        @media (prefers-reduced-motion: reduce) {
          .numa-bob, .numa-bob-fast, .numa-eye, .numa-tilt, .numa-tilt-active,
          .numa-ear-l, .numa-ear-r, .numa-ear-l-active, .numa-ear-r-active, .numa-spark {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  )
}
