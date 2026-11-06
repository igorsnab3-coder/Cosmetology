const STRAND_A = "M20 10 C50 35, 50 65, 20 90 C-10 115, -10 145, 20 170 C50 195, 50 225, 20 250 C5 262, 5 270, 20 275";
const STRAND_B = "M60 10 C30 35, 30 65, 60 90 C90 115, 90 145, 60 170 C30 195, 30 225, 60 250 C75 262, 75 270, 60 275";

const RUNGS = [28, 52, 76, 100, 124, 148, 172, 196, 220, 244];
const RUNGS_ALT = [30, 58, 86, 114, 142, 170, 198, 226, 254];
const RUNG_X = [[28, 52], [24, 56], [22, 58], [24, 56]];

function Rungs({ ys }) {
  return ys.map((y, index) => {
    const [x1, x2] = RUNG_X[index % 4];
    return <line key={y} x1={x1} y1={y} x2={x2} y2={y} />;
  });
}

function Helix({ className, strokeA, strokeB, width, rungStroke, rungWidth, rungOpacity, alt, defs }) {
  return (
    <div className={`dna ${className}`}>
      <svg viewBox="0 0 80 280" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d={STRAND_A} stroke={strokeA} strokeWidth={width} />
        <path d={STRAND_B} stroke={strokeB} strokeWidth={width} />
        <g stroke={rungStroke} strokeWidth={rungWidth} opacity={rungOpacity}>
          <Rungs ys={alt ? RUNGS_ALT : RUNGS} />
        </g>
        {defs}
      </svg>
    </div>
  );
}

export default function Ambient({ dna = false }) {
  return (
    <div className="ambient" aria-hidden="true">
      <span className="ambient__orb ambient__orb--a" />
      <span className="ambient__orb ambient__orb--b" />
      <span className="ambient__orb ambient__orb--c" />

      {dna && (
        <>
          <Helix
            className="dna--1"
            strokeA="url(#dnaStroke)"
            strokeB="url(#dnaStroke)"
            width="2.2"
            rungStroke="url(#dnaRung)"
            rungWidth="1.6"
            defs={
              <defs>
                <linearGradient id="dnaStroke" x1="0" y1="0" x2="0" y2="1">
                  <stop stopColor="#b89a8c" />
                  <stop offset="1" stopColor="#7fa992" />
                </linearGradient>
                <linearGradient id="dnaRung" x1="0" y1="0" x2="1" y2="0">
                  <stop stopColor="#c9b0a4" />
                  <stop offset="1" stopColor="#9bb8a8" />
                </linearGradient>
              </defs>
            }
          />
          <Helix className="dna--2" strokeA="#9bb8a8" strokeB="#c9b0a4" width="2" rungStroke="#b8c9be" rungWidth="1.4" rungOpacity="0.85" />
          <Helix className="dna--3" strokeA="#b89a8c" strokeB="#8fb39d" width="2.4" rungStroke="#c5b2a6" rungWidth="1.5" alt />
          <Helix className="dna--4" strokeA="#a8c4b4" strokeB="#d0b5a8" width="2" rungStroke="#bcc9c1" rungWidth="1.3" />
        </>
      )}
    </div>
  );
}
