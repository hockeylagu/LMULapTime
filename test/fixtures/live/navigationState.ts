/** A /navigation/state body of build 14200 (Le Mans, LMP3), reduced to the fields the dashboard reads. Names are made up. */
export const NAVIGATION_STATE_LE_MANS = {
  loadingStatus: {
    loading: false,
    loadingData: JSON.stringify({
      selectedCar: { classes: ['ELMS2025', 'Ginetta_G61LTP3_Evo', 'LMP3'], drivers: [{ name: 'Driver One' }], number: '4',
        vehFile: String.raw`C:\LMU\Installed\Vehicles\Ginetta_G61Evo_2025\1.09\4_25_DKR_E8E7FBE8C.VEH` },
      trackInfo: { cmpName: 'LeMans_2023', corners: '38', sceneDesc: 'LEMANSWEC', trackName: 'Circuit de la Sarthe' },
    }),
    percentage: -1,
    track: { sceneDesc: 'LEMANSWEC', track: '24 Heures du Mans' },
  },
  state: { appBuild: 14200, gamePhase: 'GREEN', gameSession: 'PRACTICE1', gameState: 'GSTATE_DYN', navigationState: 'NAV_EVENT' },
};
