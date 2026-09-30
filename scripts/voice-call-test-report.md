
=== Callee-side voice-call REAL e2e test ===
API_BASE: https://localit-nhattoann.vercel.app

  PASS  debug API found/created Johnâ†”Lan conversation  â€” conv=347f782e-e6bc-4d2b-b3a4-7453d301dcba
  PASS  cleaned stale ringing rows
        [lan:log] Please implement StringeeClient event: connect
        [lan:log] Please implement StringeeClient event: connect
        [lan:log] Please implement StringeeClient event: otherdeviceauthen
        [john:log] Please implement StringeeClient event: connect
        [john:log] Please implement StringeeClient event: connect
        waiting for Lan's presence to flip online...
        [john:log] Please implement StringeeClient event: otherdeviceauthen

[1] Caller (John) clicks Phone â†’ startOutgoingCall
  PASS  Phone button visible on caller side
        đŸ“¸ callee-01-caller-after-click-phone.png

[2] Callee (Lan) sees IncomingCallWatcher popup
        đŸ“¸ callee-02-callee-popup.png
  PASS  IncomingCallWatcher popup visible on Lan

[3] Callee clicks Accept â†’ CallModal with Mute/Speaker/End
  PASS  navigated to /chat?call=...  â€” https://localit-nhattoann.vercel.app/chat?call=1c3963b9-12cc-4f1e-82c7-636c32080a10
        [lan:log] [chat] acceptIncomingCall FAILED No matching Stringee call to accept (timeout?)
        đŸ“¸ callee-03-callee-after-accept.png
  PASS  CallModal dialog is visible after Accept
  PASS  Close button is visible in CallModal  â€” terminal state
  PASS  Mute hidden in terminal state  â€” failed/closed
  PASS  Speaker hidden in terminal state  â€” failed/closed
  PASS  CallModal shows a state headline  â€” Call failed

[5] Click End/Close â†’ CallModal should close
        đŸ“¸ callee-04-callee-after-end.png
  PASS  CallModal closes after End/Close

=== Summary ===
Total: 11  Pass: 11  Fail: 0
