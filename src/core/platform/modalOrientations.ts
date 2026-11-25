import type { ModalProps } from "react-native";

/**
 * Every orientation a React Native `<Modal>` may be presented in. Pass it as
 * `supportedOrientations` on **every** `<Modal>` in the app.
 *
 * ## Why this exists — 2026-11-24, the first iPhone build
 *
 * Without the prop, React Native presents the modal's view controller as
 * portrait-only on iPhone: an empty mask becomes
 * `UIInterfaceOrientationMaskPortrait`
 * (`RCTModalHostViewComponentView.mm`, `supportedOrientationsMask`). The
 * players lock the whole app to landscape through expo-screen-orientation,
 * so a portrait-only modal opened inside a player has no orientation in
 * common with the app, and UIKit raises
 * `UIApplicationInvalidInterfaceOrientation`.
 *
 * A development build never shows it: React Native catches the mismatch
 * there, logs "Modal was presented with … orientations mask but the
 * application only supports … NOTE: This will crash in non-dev mode." and
 * carries on (`RCTFabricModalHostViewController.mm`, under `RCT_DEV`). The
 * TestFlight build is non-dev, so it was simply killed.
 *
 * That is the likeliest cause of both crashes in the owner's iPhone
 * recording — the Tracks sheet in the movie player, the ☰ channel list in
 * the live player — and of the tester's report that the channel list "does
 * not work" ("قائمة القنوات مش شغالة"): opening it ended the app.
 *
 * Android and Android TV ignore the prop, so this changes nothing there.
 */
export const MODAL_ORIENTATIONS: NonNullable<ModalProps["supportedOrientations"]> = [
  "portrait",
  "portrait-upside-down",
  "landscape",
  "landscape-left",
  "landscape-right",
];
