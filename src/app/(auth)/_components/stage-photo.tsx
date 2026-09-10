import Image from 'next/image'

export function StagePhoto() {
  return (
    <>
      <style>{`
        @keyframes stage-drift {
          from { transform: scale(1) translate3d(0, 0, 0); }
          to   { transform: scale(1.06) translate3d(-1.2%, -0.8%, 0); }
        }
        .stage-drift {
          animation: stage-drift 28s var(--ease-soft) infinite alternate;
        }
        @media (prefers-reduced-motion: reduce) {
          .stage-drift { animation: none; }
        }
      `}</style>
      <Image
        src="/eu-gene-battle.jpg"
        alt=""
        fill
        priority
        sizes="(min-width: 1024px) 52vw, 100vw"
        className="stage-drift object-cover object-[50%_35%]"
      />
    </>
  )
}
