using System.Runtime.InteropServices;

namespace LmuTelemetryRecorder;

// Layout mirrors rFactor2SharedMemoryMapPlugin v3.x (rF2Data.cs / InternalsPlugin.hpp).
// Pack=4 and field order are load-bearing: a single wrong field silently shifts every
// following value into plausible-looking garbage. Verify with `probe` before recording.
internal static class Rf2Constants
{
    public const int MaxMappedVehicles = 128;

    public const string TelemetryBuffer = "$rFactor2SMMP_Telemetry$";
    public const string ScoringBuffer = "$rFactor2SMMP_Scoring$";
    public const string ExtendedBuffer = "$rFactor2SMMP_Extended$";
}

[StructLayout(LayoutKind.Sequential, Pack = 4)]
internal struct Rf2Vec3
{
    public double X;
    public double Y;
    public double Z;
}

[StructLayout(LayoutKind.Sequential, Pack = 4)]
internal struct Rf2Wheel
{
    public double SuspensionDeflection;
    public double RideHeight;
    public double SuspForce;
    public double BrakeTemp;
    public double BrakePressure;

    public double Rotation;
    public double LateralPatchVel;
    public double LongitudinalPatchVel;
    public double LateralGroundVel;
    public double LongitudinalGroundVel;
    public double Camber;
    public double LateralForce;
    public double LongitudinalForce;
    public double TireLoad;

    public double GripFract;
    public double Pressure;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 3)]
    public double[] Temperature;

    public double Wear;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 16)]
    public byte[] TerrainName;

    public byte SurfaceType;
    public byte Flat;
    public byte Detached;
    public byte StaticUndeflectedRadius;

    public double VerticalTireDeflection;
    public double WheelYLocation;
    public double Toe;

    public double TireCarcassTemperature;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 3)]
    public double[] TireInnerLayerTemperature;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 24)]
    public byte[] Expansion;
}

[StructLayout(LayoutKind.Sequential, Pack = 4)]
internal struct Rf2VehicleTelemetry
{
    public int ID;
    public double DeltaTime;
    public double ElapsedTime;
    public int LapNumber;
    public double LapStartET;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 64)]
    public byte[] VehicleName;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 64)]
    public byte[] TrackName;

    public Rf2Vec3 Pos;
    public Rf2Vec3 LocalVel;
    public Rf2Vec3 LocalAccel;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 3)]
    public Rf2Vec3[] Ori;

    public Rf2Vec3 LocalRot;
    public Rf2Vec3 LocalRotAccel;

    public int Gear;
    public double EngineRPM;
    public double EngineWaterTemp;
    public double EngineOilTemp;
    public double ClutchRPM;

    public double UnfilteredThrottle;
    public double UnfilteredBrake;
    public double UnfilteredSteering;
    public double UnfilteredClutch;

    public double FilteredThrottle;
    public double FilteredBrake;
    public double FilteredSteering;
    public double FilteredClutch;

    public double SteeringShaftTorque;
    public double Front3rdDeflection;
    public double Rear3rdDeflection;

    public double FrontWingHeight;
    public double FrontRideHeight;
    public double RearRideHeight;
    public double Drag;
    public double FrontDownforce;
    public double RearDownforce;

    public double Fuel;
    public double EngineMaxRPM;
    public byte ScheduledStops;
    public byte Overheating;
    public byte Detached;
    public byte Headlights;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 8)]
    public byte[] DentSeverity;

    public double LastImpactET;
    public double LastImpactMagnitude;
    public Rf2Vec3 LastImpactPos;

    public double EngineTorque;
    public int CurrentSector;
    public byte SpeedLimiter;
    public byte MaxGears;
    public byte FrontTireCompoundIndex;
    public byte RearTireCompoundIndex;
    public double FuelCapacity;
    public byte FrontFlapActivated;
    public byte RearFlapActivated;
    public byte RearFlapLegalStatus;
    public byte IgnitionStarter;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 18)]
    public byte[] FrontTireCompoundName;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 18)]
    public byte[] RearTireCompoundName;

    public byte SpeedLimiterAvailable;
    public byte AntiStallActivated;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 2)]
    public byte[] Unused;

    public float VisualSteeringWheelRange;

    public double RearBrakeBias;
    public double TurboBoostPressure;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 3)]
    public float[] PhysicsToGraphicsOffset;

    public float PhysicalSteeringWheelRange;

    public double BatteryChargeFraction;

    public double ElectricBoostMotorTorque;
    public double ElectricBoostMotorRPM;
    public double ElectricBoostMotorTemperature;
    public double ElectricBoostWaterTemperature;
    public byte ElectricBoostMotorState;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 111)]
    public byte[] Expansion;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 4)]
    public Rf2Wheel[] Wheels;
}

[StructLayout(LayoutKind.Sequential, Pack = 4)]
internal struct Rf2VehicleScoring
{
    public int ID;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 32)]
    public byte[] DriverName;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 64)]
    public byte[] VehicleName;

    public short TotalLaps;
    public sbyte Sector;
    public sbyte FinishStatus;

    public double LapDist;
    public double PathLateral;
    public double TrackEdge;

    public double BestSector1;
    public double BestSector2;
    public double BestLapTime;
    public double LastSector1;
    public double LastSector2;
    public double LastLapTime;
    public double CurSector1;
    public double CurSector2;

    public short NumPitstops;
    public short NumPenalties;
    public byte IsPlayer;
    public sbyte Control;
    public byte InPits;
    public byte Place;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 32)]
    public byte[] VehicleClass;

    public double TimeBehindNext;
    public int LapsBehindNext;
    public double TimeBehindLeader;
    public int LapsBehindLeader;
    public double LapStartET;

    public Rf2Vec3 Pos;
    public Rf2Vec3 LocalVel;
    public Rf2Vec3 LocalAccel;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 3)]
    public Rf2Vec3[] Ori;

    public Rf2Vec3 LocalRot;
    public Rf2Vec3 LocalRotAccel;

    public byte Headlights;
    public byte PitState;
    public byte ServerScored;
    public byte IndividualPhase;
    public int Qualification;
    public double TimeIntoLap;
    public double EstimatedLapTime;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 24)]
    public byte[] PitGroup;

    public byte Flag;
    public byte UnderYellow;
    public byte CountLapFlag;
    public byte InGarageStall;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 16)]
    public byte[] UpgradePack;

    public float PitLapDist;
    public float BestLapSector1;
    public float BestLapSector2;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 48)]
    public byte[] Expansion;
}

[StructLayout(LayoutKind.Sequential, Pack = 4)]
internal struct Rf2ScoringInfo
{
    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 64)]
    public byte[] TrackName;

    public int Session;
    public double CurrentET;
    public double EndET;
    public int MaxLaps;
    public double LapDist;

    // Native pointer field, unused here but occupies 8 bytes.
    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 8)]
    public byte[] Pointer1;

    public int NumVehicles;
    public byte GamePhase;
    public sbyte YellowFlagState;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 3)]
    public sbyte[] SectorFlag;

    public byte StartLight;
    public byte NumRedLights;
    public byte InRealtime;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 32)]
    public byte[] PlayerName;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 64)]
    public byte[] PlrFileName;

    public double DarkCloud;
    public double Raining;
    public double AmbientTemp;
    public double TrackTemp;
    public Rf2Vec3 Wind;
    public double MinPathWetness;
    public double MaxPathWetness;

    public byte GameMode;
    public byte IsPasswordProtected;
    public ushort ServerPort;
    public uint ServerPublicIP;
    public int MaxPlayers;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 32)]
    public byte[] ServerName;

    public float StartET;

    public double AvgPathWetness;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 200)]
    public byte[] Expansion;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 8)]
    public byte[] Pointer2;
}

[StructLayout(LayoutKind.Sequential, Pack = 4)]
internal struct Rf2Telemetry
{
    public uint VersionUpdateBegin;
    public uint VersionUpdateEnd;
    public int BytesUpdatedHint;

    public int NumVehicles;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = Rf2Constants.MaxMappedVehicles)]
    public Rf2VehicleTelemetry[] Vehicles;
}

[StructLayout(LayoutKind.Sequential, Pack = 4)]
internal struct Rf2Scoring
{
    public uint VersionUpdateBegin;
    public uint VersionUpdateEnd;
    public int BytesUpdatedHint;

    public Rf2ScoringInfo ScoringInfo;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = Rf2Constants.MaxMappedVehicles)]
    public Rf2VehicleScoring[] Vehicles;
}
