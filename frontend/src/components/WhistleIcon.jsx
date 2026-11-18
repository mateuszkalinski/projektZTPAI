// Gwizdek sędziowski – znak Pogwizdka (kolor z currentColor, otwór w kolorze papieru)
export default function WhistleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 64 48" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M7 13h26.2a15.5 15.5 0 1 1-1.4 22.4L7 30.5A5 5 0 0 1 2 25.5v-7.5a5 5 0 0 1 5-5z"
      />
      <rect fill="currentColor" x="19" y="8" width="8" height="6" rx="1" />
      <circle fill="var(--whistle-hole, var(--paper))" cx="44" cy="26.5" r="5.5" />
    </svg>
  )
}
