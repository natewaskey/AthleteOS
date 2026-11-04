# App Store and Google Play versions

Motiq works today as an installable web app (Add to Home Screen). Store versions are optional and cost money: Apple charges $99 a year, Google $25 once, and both take 15 to 30% of in-app purchases. Recommended: stay on the web until teams ask for store apps.

What's ready: `capacitor.config.json` (app id `app.motiq.mobile`, change it to your own reverse domain before the first upload) and `tools/build-web.sh`, which copies the app into `dist/`.

## Steps

1. Install Node, Xcode (Mac, for iPhone) and Android Studio.
2. `npm install --save-dev @capacitor/cli @capacitor/core @capacitor/ios @capacitor/android`
3. `bash tools/build-web.sh && npx cap add ios && npx cap add android`
4. iOS: in `ios/App/App/Info.plist` add `NSCameraUsageDescription` ("Motiq uses the camera to check your form and time sprints. Videos stay on your phone unless you share them.").
5. Android: camera permission in `android/app/src/main/AndroidManifest.xml`.
6. After each web change: `bash tools/build-web.sh && npx cap sync`, then build in Xcode / Android Studio.
7. Store listings need: the privacy policy link, account deletion in the app (done: Settings › Privacy and data), age rating, and Apple's privacy "nutrition label" (health and fitness, contact info, user content; not used for tracking).
8. Payments: Apple requires in-app purchase for digital features bought inside an iPhone app, with some exceptions for US apps linking to the web. Check the current rules before turning billing on in store builds.
