// Firebase web config (public by design; access is controlled by the Firestore rules).
// Firebase web config is safe to publish — access is protected by firestore.rules.
// Leave apiKey empty to run in local demo mode.
export const CONFIG = {
  firebase: {
    apiKey: 'AIzaSyDJA-a96VFTVwctXhhQlv-_FqtnLPGaWCU',
    authDomain: 'razem-b1d94.firebaseapp.com',
    projectId: 'razem-b1d94',
    storageBucket: 'razem-b1d94.firebasestorage.app',
    messagingSenderId: '729011545590',
    appId: '1:729011545590:web:ef76c2f91851b7135c93d7',
  },
  // Public VAPID key for web push (the private one goes ONLY into GitHub secrets).
  vapidPublicKey: 'BIl5uorvCvw0g710I9xZD2p-Ff_h_DNsMJL5mD73hfJYxEc50j-Cuo22QCcwZnWeCfhK_D2fTnOOav2Hhw_mjxM',
};
