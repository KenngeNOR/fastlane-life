# Fast Lane Life

A remake-in-spirit of the 1991 life-sim board game *Jones in the Fast Lane*: work, study,
shop and relax your way to wealth, happiness, education and career goals. Original code,
names and art; English UI. Runs in any browser and as a native app on Android and iPhone
(via [Capacitor](https://capacitorjs.com)).

## Play modes

| Mode | How |
|---|---|
| Solo / vs computer | *Play on this device* — add computer opponents in the lobby |
| Pass-and-play | *Play on this device* — add more players, hand the phone around |
| Online / same Wi-Fi | One phone taps *Host an online game* and shares the 6-letter code; the others tap *Join with a code*. Android, iPhone and browsers can all play together. |

### How online play works (no game server)

The host device runs the game rules and holds the authoritative state. Other devices send
their moves to the host over a direct **WebRTC peer-to-peer** connection and receive the
updated game back.

WebRTC needs a short "introduction" before two phones can talk. That uses the free public
[PeerJS](https://peerjs.com) broker: the host registers under its invite code and guests look
it up. After that, game traffic goes directly between the devices (on the same Wi-Fi it never
leaves the local network). So you don't run or pay for any server, but devices need internet
access when connecting.

To use your own broker instead (e.g. a fully offline LAN party, or if the public one is down),
run `npx peerjs --port 9000` on any machine and build with:

```sh
VITE_PEER_HOST=192.168.1.10 VITE_PEER_PORT=9000 VITE_PEER_SECURE=false npm run build
```

If a guest's connection drops they rejoin automatically; the host can also let the computer
play for a disconnected player.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173 (also reachable from phones on your Wi-Fi)
npm test           # rules + bot simulation tests
npm run build      # web build into dist/
```

Code layout: `src/game` (pure rules, data, computer opponent), `src/net` (host/client
sessions over PeerJS), `src/ui` + `src/main.ts` (screens), `android/` and `ios/` (Capacitor
native projects).

## Phone apps

**Android** — every push builds a debug APK in GitHub Actions (artifact
`FastLaneLife-android-apk`). Install it on a phone with "install unknown apps" enabled.
Locally: `npm run android` opens Android Studio (needs Android Studio + JDK 21).

**iPhone** — `npm run ios` opens the Xcode project (needs a Mac with Xcode; a free Apple ID
can install on your own phone, App Store/TestFlight needs a paid developer account).
Without a Mac, iPhone players can use the web version in Safari → *Share → Add to Home
Screen*; it plays together with the Android app.

**Web** — on `main`, the workflow deploys `dist/` to GitHub Pages (enable it once under
Settings → Pages → Source: GitHub Actions).

App icons/splash screens are generated from `assets/icon.png` with
`npx @capacitor/assets generate`.
