# Pacta web app

Next.js 15 + Tailwind 4 + Pollar (`@pollar/react`) + Stellar JS SDK. Spanish UI.

See the project [README](../README.md) for setup. Key files:

- `src/lib/despensa.ts`: typed contract client (runtime spec from the network), reads, error messages, formatting
- `src/components/Wallet.tsx`: wallet abstraction (`useWallet`, `useAction`) over Pollar. The app is read-only without a key
- `src/components/ui.tsx`: shared primitives (notice, stat, hint, field, progress, dialog, transaction steps)
- `src/app/campaign/[id]/CampaignView.tsx`: buyer, producer and verifier flows for a campaign
- `src/app/producer/`: create and manage pre-sales, plus the delivery page opened from the buyer's QR
