using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace LmuTelemetryRecorder;

internal static class Program
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        NumberHandling = JsonNumberHandling.AllowNamedFloatingPointLiterals
    };

    private static volatile bool _stop;

    private static int Main(string[] args)
    {
        Console.CancelKeyPress += (_, e) =>
        {
            e.Cancel = true;
            _stop = true;
        };

        var mode = args.FirstOrDefault()?.ToLowerInvariant() ?? "probe";

        if (!Rf2Layout.Validate(Console.Error))
        {
            Console.Error.WriteLine("Struct definitions are out of sync with the plugin; refusing to read.");
            return 2;
        }

        return mode switch
        {
            "probe" => Probe(),
            "dump" => Dump(),
            "record" => Record(args),
            _ => Usage()
        };
    }

    private static int Usage()
    {
        Console.WriteLine("""
            lmu-telemetry-recorder

              probe                     Print struct sizes and a live 1 Hz dump of both buffers.
                                        Use this to confirm the layout is correct, and to test
                                        whether the buffers tick while watching a replay.

              record [options]          Stream to JSONL until Ctrl+C.
                --out <dir>             Output directory (default test/fixtures/telemetry)
                --seconds <n>           Auto-stop after n seconds

              dump                      One-shot diagnostic: buffer sizes, decoded ScoringInfo,
                                        and every ASCII string found in each buffer with its
                                        offset. Use this when detection fails.
            """);
        return 1;
    }

    private static unsafe int Dump()
    {
        var opened = OpenBuffers();
        if (opened is null)
        {
            return 1;
        }

        var (telemetry, scoring) = opened.Value;
        using var _t = telemetry;
        using var _s = scoring;

        Console.WriteLine($"struct sizes: Rf2Telemetry {Marshal.SizeOf<Rf2Telemetry>()}  Rf2Scoring {Marshal.SizeOf<Rf2Scoring>()}");
        Console.WriteLine($"              Rf2VehicleTelemetry {Marshal.SizeOf<Rf2VehicleTelemetry>()}  Rf2Wheel {Marshal.SizeOf<Rf2Wheel>()}");
        Console.WriteLine($"              Rf2VehicleScoring {Marshal.SizeOf<Rf2VehicleScoring>()}  Rf2ScoringInfo {Marshal.SizeOf<Rf2ScoringInfo>()}");
        Console.WriteLine();
        Console.WriteLine($"telemetry capacity {telemetry.Capacity} ({telemetry.Capacity / 4096.0:F2} pages), version {telemetry.VersionBegin}/{telemetry.VersionEnd}");
        Console.WriteLine($"scoring   capacity {scoring.Capacity} ({scoring.Capacity / 4096.0:F2} pages), version {scoring.VersionBegin}/{scoring.VersionEnd}");
        Console.WriteLine();

        scoring.TryReadCoherent(Rf2Layout.ReadScoringInfo, out var info);
        Console.WriteLine("ScoringInfo as decoded by our struct:");
        Console.WriteLine($"  trackName    '{Rf2Layout.AsciiZ(info.TrackName)}'");
        Console.WriteLine($"  session      {info.Session}   gamePhase {info.GamePhase}   inRealtime {info.InRealtime}");
        Console.WriteLine($"  currentET    {info.CurrentET:F3}   endET {info.EndET:F1}   maxLaps {info.MaxLaps}");
        Console.WriteLine($"  lapDist      {info.LapDist:F2} m   numVehicles {info.NumVehicles}");
        Console.WriteLine($"  playerName   '{Rf2Layout.AsciiZ(info.PlayerName)}'");
        Console.WriteLine($"  plrFileName  '{Rf2Layout.AsciiZ(info.PlrFileName)}'");
        Console.WriteLine($"  ambient {info.AmbientTemp:F1}C  track {info.TrackTemp:F1}C  raining {info.Raining:F3}");
        Console.WriteLine($"  numVehicles raw @ {Rf2Layout.ScoringNumVehiclesOffset} = {Rf2Layout.ReadInt(scoring.BasePtr, Rf2Layout.ScoringNumVehiclesOffset)}");
        Console.WriteLine();

        DumpStrings("scoring", scoring, 60);
        Console.WriteLine();
        DumpStrings("telemetry", telemetry, 60);

        return 0;
    }

    private static unsafe void DumpStrings(string label, Rf2Buffer buffer, int max)
    {
        var p = (byte*)buffer.BasePtr;
        var capacity = (int)buffer.Capacity;
        var shown = 0;
        var total = 0;

        Console.WriteLine($"ASCII strings in {label} buffer (offset : length : text):");

        for (var i = 0; i < capacity && shown < max; i++)
        {
            if (p[i] is < 32 or > 126)
            {
                continue;
            }

            var start = i;
            while (i < capacity && p[i] is >= 32 and <= 126)
            {
                i++;
            }

            var length = i - start;
            if (length < 3)
            {
                continue;
            }

            total++;
            var text = System.Text.Encoding.ASCII.GetString(p + start, Math.Min(length, 48));
            Console.WriteLine($"  {start,8} : {length,3} : {text}");
            shown++;
        }

        if (shown == 0)
        {
            Console.WriteLine("  <none - buffer looks empty, so no session is loaded>");
        }
        else if (shown == max)
        {
            Console.WriteLine($"  ... (truncated at {max})");
        }
    }

    /// <summary>Polls until the plugin's buffers exist, so the tool can be started before the game.</summary>
    private static (Rf2Buffer telemetry, Rf2Buffer scoring)? OpenBuffers()
    {
        var announced = false;

        while (!_stop)
        {
            var telemetry = Rf2Buffer.TryOpen(Rf2Constants.TelemetryBuffer);
            var scoring = Rf2Buffer.TryOpen(Rf2Constants.ScoringBuffer);

            if (telemetry is not null && scoring is not null)
            {
                if (announced)
                {
                    Console.WriteLine("\rConnected to Le Mans Ultimate.                    ");
                }

                return (telemetry, scoring);
            }

            telemetry?.Dispose();
            scoring?.Dispose();

            if (!announced)
            {
                Console.WriteLine(
                    "Waiting for Le Mans Ultimate... (Ctrl+C to quit)\n" +
                    "If the game is already running, check Plugins\\CustomPluginVariables.JSON has\n" +
                    "\" Enabled\": 1 for rFactor2SharedMemoryMapPlugin64.dll.");
                announced = true;
            }

            Thread.Sleep(1000);
        }

        return null;
    }

    /// <summary>
    /// Polls until the scoring vehicle array can be located. Telemetry is optional: the game
    /// leaves that buffer empty during replay playback, where only scoring keeps updating.
    /// </summary>
    private static (Rf2Calibration? Telemetry, Rf2Calibration Scoring)? WaitForLayout(
        Rf2Buffer telemetry,
        Rf2Buffer scoring)
    {
        var announced = false;

        while (!_stop)
        {
            var telCal = Rf2Calibration.DetectTelemetry(telemetry);
            var scoCal = Rf2Calibration.DetectScoring(scoring);

            if (scoCal is not null)
            {
                Console.WriteLine($"Layout: scoring {Describe(scoCal)}");
                if (telCal is null)
                {
                    Console.WriteLine(
                        "No telemetry buffer - scoring-only mode (this is expected in a replay).\n" +
                        "lapDist/pathLateral/trackEdge will be captured at 5 Hz; rpm, pedals and\n" +
                        "per-wheel terrain need a live drive.");
                }
                else
                {
                    Console.WriteLine($"        telemetry {Describe(telCal)}");
                }

                return (telCal, scoCal);
            }

            if (!announced)
            {
                Console.WriteLine("Waiting for a session... load a track or start a replay. (Ctrl+C to quit)");
                announced = true;
            }

            Thread.Sleep(1000);
        }

        return null;
    }

    private static int Probe()
    {
        var opened = OpenBuffers();
        if (opened is null)
        {
            return 1;
        }

        var (telemetry, scoring) = opened.Value;
        using var _t = telemetry;
        using var _s = scoring;

        Console.WriteLine($"telemetry buffer '{telemetry.Name}' capacity {telemetry.Capacity} bytes");
        Console.WriteLine($"scoring   buffer '{scoring.Name}' capacity {scoring.Capacity} bytes");
        Console.WriteLine();

        var telCal = Rf2Calibration.DetectTelemetry(telemetry);
        var scoCal = Rf2Calibration.DetectScoring(scoring);

        Console.WriteLine("Vehicle array layout (detected by signature scan vs. our struct definitions):");
        Console.WriteLine($"  telemetry  detected {Describe(telCal)}   struct offset {Rf2Layout.TelemetryVehiclesOffset} stride {Rf2Layout.TelemetryVehicleStride}");
        Console.WriteLine($"  scoring    detected {Describe(scoCal)}   struct offset {Rf2Layout.ScoringVehiclesOffset} stride {Rf2Layout.ScoringVehicleStride}");
        Console.WriteLine();

        var layout = WaitForLayout(telemetry, scoring);
        if (layout is null)
        {
            return 1;
        }

        (telCal, scoCal) = layout.Value;

        Console.WriteLine("Watching. Ctrl+C to stop. Sanity-check that speed/rpm/gear/lapDist move");
        Console.WriteLine("while driving, and note whether the version counters advance in a replay.");
        Console.WriteLine();

        uint lastTelVersion = 0;
        uint lastScoVersion = 0;

        while (!_stop)
        {
            var telVersion = telemetry.VersionEnd;
            var scoVersion = scoring.VersionEnd;

            scoring.TryReadCoherent(Rf2Layout.ReadScoringInfo, out var info);

            var playerScoring = TryFindPlayerScoring(scoring, scoCal, out var ps) ? ps : default;
            var hasTel = TryFindTelemetry(telemetry, telCal, playerScoring.ID, out var tel);

            var speedKmh = hasTel
                ? Math.Sqrt(
                    (tel.LocalVel.X * tel.LocalVel.X) +
                    (tel.LocalVel.Y * tel.LocalVel.Y) +
                    (tel.LocalVel.Z * tel.LocalVel.Z)) * 3.6
                : 0.0;

            Console.WriteLine(string.Create(CultureInfo.InvariantCulture, $"""
                --- {DateTime.Now:HH:mm:ss}
                  ticks/s      tel {telVersion - lastTelVersion,5}   sco {scoVersion - lastScoVersion,5}
                  track        '{Rf2Layout.AsciiZ(info.TrackName)}'  len {info.LapDist:F1} m  cars {info.NumVehicles}
                  session      type {info.Session}  phase {info.GamePhase}  inRealtime {info.InRealtime}  ET {info.CurrentET:F2}
                  player       '{Rf2Layout.AsciiZ(playerScoring.DriverName)}'  id {playerScoring.ID}  place {playerScoring.Place}
                  scoring geom lapDist {playerScoring.LapDist:F2}  pathLateral {playerScoring.PathLateral:F2}  trackEdge {playerScoring.TrackEdge:F2}
                  scoring pos  {playerScoring.Pos.X:F2} {playerScoring.Pos.Y:F2} {playerScoring.Pos.Z:F2}
                  telemetry    {(hasTel ? $"ET {tel.ElapsedTime:F3}  lap {tel.LapNumber}  gear {tel.Gear}  rpm {tel.EngineRPM:F0}/{tel.EngineMaxRPM:F0}  speed {speedKmh:F1} km/h  fuel {tel.Fuel:F2}" : "<no telemetry for player>")}
                  inputs       {(hasTel ? $"thr {tel.UnfilteredThrottle:F2}  brk {tel.UnfilteredBrake:F2}  steer {tel.UnfilteredSteering:F2}" : "-")}
                  terrain      {(hasTel ? string.Join(" | ", tel.Wheels.Select(w => $"{Rf2Layout.AsciiZ(w.TerrainName)}({w.SurfaceType})")) : "-")}
                """));

            lastTelVersion = telVersion;
            lastScoVersion = scoVersion;
            Thread.Sleep(1000);
        }

        return 0;
    }

    private static string Describe(Rf2Calibration? cal) =>
        cal is null ? "<not found>" : $"offset {cal.Offset} stride {cal.Stride} ({cal.SampleCount} entries)";

    private static bool TryFindPlayerScoring(Rf2Buffer scoring, Rf2Calibration cal, out Rf2VehicleScoring result)
    {
        var found = false;
        var value = default(Rf2VehicleScoring);

        scoring.TryReadCoherent(basePtr =>
        {
            var count = Math.Min(
                Rf2Layout.ReadInt(basePtr, Rf2Layout.ScoringNumVehiclesOffset),
                Rf2Constants.MaxMappedVehicles);

            for (var i = 0; i < count; i++)
            {
                var vehicle = Rf2Layout.ReadScoringVehicle(basePtr, cal, i);
                if (vehicle.IsPlayer != 0 || vehicle.Control == 0)
                {
                    value = vehicle;
                    found = true;
                    return true;
                }
            }

            return false;
        }, out _);

        result = value;
        return found;
    }

    private static bool TryFindTelemetry(
        Rf2Buffer telemetry,
        Rf2Calibration? cal,
        int vehicleId,
        out Rf2VehicleTelemetry result)
    {
        if (cal is null)
        {
            result = default;
            return false;
        }

        var found = false;
        var value = default(Rf2VehicleTelemetry);

        telemetry.TryReadCoherent(basePtr =>
        {
            var count = Math.Min(
                Rf2Layout.ReadInt(basePtr, Rf2Layout.TelemetryNumVehiclesOffset),
                Rf2Constants.MaxMappedVehicles);

            for (var i = 0; i < count; i++)
            {
                var vehicle = Rf2Layout.ReadTelemetryVehicle(basePtr, cal, i);
                if (vehicle.ID == vehicleId)
                {
                    value = vehicle;
                    found = true;
                    return true;
                }
            }

            return false;
        }, out _);

        result = value;
        return found;
    }

    private static int Record(string[] args)
    {
        var outDir = GetOption(args, "--out") ?? Path.Combine("test", "fixtures", "telemetry");
        var seconds = double.TryParse(GetOption(args, "--seconds"), CultureInfo.InvariantCulture, out var s) ? s : 0;

        var opened = OpenBuffers();
        if (opened is null)
        {
            return 1;
        }

        var (telemetry, scoring) = opened.Value;
        using var _t = telemetry;
        using var _s = scoring;

        var layout = WaitForLayout(telemetry, scoring);
        if (layout is null)
        {
            return 1;
        }

        var (telCal, scoCal) = layout.Value;

        Directory.CreateDirectory(outDir);

        StreamWriter? writer = null;
        var telemetryCount = 0;
        var scoringCount = 0;
        var tornReads = 0;
        var lastTelemetryEt = double.NaN;
        var lastScoringEt = double.NaN;
        var playerId = int.MinValue;
        var clock = Stopwatch.StartNew();

        Console.WriteLine("Waiting for a session... drive out of the garage to start recording. Ctrl+C to stop.");

        try
        {
            while (!_stop && (seconds <= 0 || clock.Elapsed.TotalSeconds < seconds))
            {
                if (!scoring.TryReadCoherent(Rf2Layout.ReadScoringInfo, out var info))
                {
                    tornReads++;
                    Thread.Sleep(1);
                    continue;
                }

                var trackName = Rf2Layout.AsciiZ(info.TrackName);
                if (string.IsNullOrEmpty(trackName) || info.NumVehicles <= 0)
                {
                    Thread.Sleep(50);
                    continue;
                }

                if (writer is null)
                {
                    var file = Path.Combine(
                        outDir,
                        $"{Sanitize(trackName)}_{DateTime.Now:yyyyMMdd-HHmmss}.jsonl");
                    writer = new StreamWriter(file) { AutoFlush = false };
                    WriteMeta(writer, info, trackName, telCal, scoCal);
                    Console.WriteLine($"Recording to {file}");
                }

                if (TryFindPlayerScoring(scoring, scoCal, out var player))
                {
                    playerId = player.ID;
                }

                if (info.CurrentET != lastScoringEt)
                {
                    lastScoringEt = info.CurrentET;
                    WriteScoring(writer, scoring, scoCal, info);
                    scoringCount++;

                    if (scoringCount % 25 == 0)
                    {
                        writer.Flush();
                        Console.Write($"\r  {telemetryCount} telemetry / {scoringCount} scoring samples, {tornReads} torn reads");
                    }
                }

                if (playerId != int.MinValue &&
                    TryFindTelemetry(telemetry, telCal, playerId, out var tel) &&
                    tel.ElapsedTime != lastTelemetryEt)
                {
                    lastTelemetryEt = tel.ElapsedTime;
                    writer.WriteLine(JsonSerializer.Serialize(BuildTelemetrySample(tel), JsonOptions));
                    telemetryCount++;

                    if (telemetryCount % 500 == 0)
                    {
                        writer.Flush();
                        Console.Write($"\r  {telemetryCount} telemetry / {scoringCount} scoring samples, {tornReads} torn reads");
                    }
                }

                Thread.Sleep(1);
            }
        }
        finally
        {
            writer?.Flush();
            writer?.Dispose();
        }

        Console.WriteLine();
        Console.WriteLine($"Done. {telemetryCount} telemetry samples, {scoringCount} scoring samples, {tornReads} torn reads.");
        return 0;
    }

    private static void WriteMeta(
        StreamWriter writer,
        Rf2ScoringInfo info,
        string trackName,
        Rf2Calibration? telCal,
        Rf2Calibration scoCal)
    {
        writer.WriteLine(JsonSerializer.Serialize(new Dictionary<string, object?>
        {
            ["t"] = "meta",
            ["recordedAt"] = DateTimeOffset.Now.ToString("o"),
            ["track"] = trackName,
            ["trackLengthM"] = R(info.LapDist, 3),
            ["player"] = Rf2Layout.AsciiZ(info.PlayerName),
            ["session"] = info.Session,
            ["ambientTempC"] = R(info.AmbientTemp, 2),
            ["trackTempC"] = R(info.TrackTemp, 2),
            ["raining"] = R(info.Raining, 4),
            ["telemetryVehicleOffset"] = telCal?.Offset,
            ["telemetryVehicleStride"] = telCal?.Stride,
            ["scoringOnly"] = telCal is null,
            ["scoringVehicleOffset"] = scoCal.Offset,
            ["scoringVehicleStride"] = scoCal.Stride
        }, JsonOptions));
    }

    private static void WriteScoring(
        StreamWriter writer,
        Rf2Buffer scoring,
        Rf2Calibration cal,
        Rf2ScoringInfo info)
    {
        var vehicles = new List<Dictionary<string, object?>>();
        var count = Math.Min(info.NumVehicles, Rf2Constants.MaxMappedVehicles);

        scoring.TryReadCoherent(basePtr =>
        {
            vehicles.Clear();
            for (var i = 0; i < count; i++)
            {
                var v = Rf2Layout.ReadScoringVehicle(basePtr, cal, i);
                vehicles.Add(new Dictionary<string, object?>
                {
                    ["id"] = v.ID,
                    ["driver"] = Rf2Layout.AsciiZ(v.DriverName),
                    ["isPlayer"] = v.IsPlayer != 0,
                    ["control"] = v.Control,
                    ["lap"] = v.TotalLaps,
                    ["sector"] = v.Sector,
                    ["lapDist"] = R(v.LapDist, 3),
                    ["pathLateral"] = R(v.PathLateral, 3),
                    ["trackEdge"] = R(v.TrackEdge, 3),
                    ["x"] = R(v.Pos.X, 3),
                    ["y"] = R(v.Pos.Y, 3),
                    ["z"] = R(v.Pos.Z, 3),
                    ["inPits"] = v.InPits != 0,
                    ["inGarage"] = v.InGarageStall != 0,
                    ["place"] = v.Place,
                    ["timeIntoLap"] = R(v.TimeIntoLap, 3),
                    ["lastLap"] = R(v.LastLapTime, 3),
                    ["bestLap"] = R(v.BestLapTime, 3)
                });
            }

            return true;
        }, out _);

        writer.WriteLine(JsonSerializer.Serialize(new Dictionary<string, object?>
        {
            ["t"] = "sco",
            ["et"] = R(info.CurrentET, 3),
            ["phase"] = info.GamePhase,
            ["inRealtime"] = info.InRealtime != 0,
            ["yellow"] = info.YellowFlagState,
            ["trackTempC"] = R(info.TrackTemp, 2),
            ["raining"] = R(info.Raining, 4),
            ["veh"] = vehicles
        }, JsonOptions));
    }

    private static Dictionary<string, object?> BuildTelemetrySample(Rf2VehicleTelemetry t)
    {
        var speedKmh = Math.Sqrt(
            (t.LocalVel.X * t.LocalVel.X) +
            (t.LocalVel.Y * t.LocalVel.Y) +
            (t.LocalVel.Z * t.LocalVel.Z)) * 3.6;

        // Derived Euler angles are a convenience for eyeballing; the raw matrix is kept
        // authoritative because the VCR's rotX/Y/Z convention is not yet confirmed to match.
        var yaw = Math.Atan2(t.Ori[2].X, t.Ori[2].Z);
        var pitch = Math.Atan2(-t.Ori[2].Y, Math.Sqrt((t.Ori[2].X * t.Ori[2].X) + (t.Ori[2].Z * t.Ori[2].Z)));
        var roll = Math.Atan2(t.Ori[0].Y, Math.Sqrt((t.Ori[0].X * t.Ori[0].X) + (t.Ori[0].Z * t.Ori[0].Z)));

        return new Dictionary<string, object?>
        {
            ["t"] = "tel",
            ["et"] = R(t.ElapsedTime, 4),
            ["dt"] = R(t.DeltaTime, 5),
            ["lap"] = t.LapNumber,
            ["lapStartEt"] = R(t.LapStartET, 4),
            ["sector"] = t.CurrentSector,

            ["gear"] = t.Gear,
            ["rpm"] = R(t.EngineRPM, 2),
            ["maxRpm"] = R(t.EngineMaxRPM, 2),
            ["torque"] = R(t.EngineTorque, 3),
            ["fuel"] = R(t.Fuel, 4),
            ["fuelCapacity"] = R(t.FuelCapacity, 3),
            ["waterTempC"] = R(t.EngineWaterTemp, 3),
            ["oilTempC"] = R(t.EngineOilTemp, 3),
            ["turboBoost"] = R(t.TurboBoostPressure, 3),
            ["rearBrakeBias"] = R(t.RearBrakeBias, 4),
            ["speedKmh"] = R(speedKmh, 4),

            ["batteryCharge"] = R(t.BatteryChargeFraction, 5),
            ["boostTorque"] = R(t.ElectricBoostMotorTorque, 3),
            ["boostRpm"] = R(t.ElectricBoostMotorRPM, 2),
            ["boostMotorTempC"] = R(t.ElectricBoostMotorTemperature, 3),
            ["boostWaterTempC"] = R(t.ElectricBoostWaterTemperature, 3),
            ["boostState"] = t.ElectricBoostMotorState,

            ["thr"] = R(t.UnfilteredThrottle, 5),
            ["brk"] = R(t.UnfilteredBrake, 5),
            ["str"] = R(t.UnfilteredSteering, 5),
            ["clu"] = R(t.UnfilteredClutch, 5),
            ["fThr"] = R(t.FilteredThrottle, 5),
            ["fBrk"] = R(t.FilteredBrake, 5),
            ["fStr"] = R(t.FilteredSteering, 5),
            ["steerTorque"] = R(t.SteeringShaftTorque, 4),
            ["steerRangeDeg"] = R(t.PhysicalSteeringWheelRange, 2),

            ["x"] = R(t.Pos.X, 4),
            ["y"] = R(t.Pos.Y, 4),
            ["z"] = R(t.Pos.Z, 4),
            ["vx"] = R(t.LocalVel.X, 4),
            ["vy"] = R(t.LocalVel.Y, 4),
            ["vz"] = R(t.LocalVel.Z, 4),
            ["ax"] = R(t.LocalAccel.X, 4),
            ["ay"] = R(t.LocalAccel.Y, 4),
            ["az"] = R(t.LocalAccel.Z, 4),
            ["yaw"] = R(yaw, 5),
            ["pitch"] = R(pitch, 5),
            ["roll"] = R(roll, 5),
            ["ori"] = new[]
            {
                R(t.Ori[0].X, 5), R(t.Ori[0].Y, 5), R(t.Ori[0].Z, 5),
                R(t.Ori[1].X, 5), R(t.Ori[1].Y, 5), R(t.Ori[1].Z, 5),
                R(t.Ori[2].X, 5), R(t.Ori[2].Y, 5), R(t.Ori[2].Z, 5)
            },
            ["rotX"] = R(t.LocalRot.X, 5),
            ["rotY"] = R(t.LocalRot.Y, 5),
            ["rotZ"] = R(t.LocalRot.Z, 5),

            ["limiter"] = t.SpeedLimiter,
            ["ignition"] = t.IgnitionStarter,
            ["headlights"] = t.Headlights,
            ["frontFlap"] = t.FrontFlapActivated,
            ["rearFlap"] = t.RearFlapActivated,
            ["rearFlapLegal"] = t.RearFlapLegalStatus,
            ["detached"] = t.Detached,
            ["overheating"] = t.Overheating,
            ["dents"] = t.DentSeverity,
            ["lastImpactEt"] = R(t.LastImpactET, 3),
            ["lastImpactMag"] = R(t.LastImpactMagnitude, 3),
            ["frontDownforce"] = R(t.FrontDownforce, 3),
            ["rearDownforce"] = R(t.RearDownforce, 3),
            ["drag"] = R(t.Drag, 3),

            ["wheels"] = t.Wheels.Select(w => new Dictionary<string, object?>
            {
                ["terrain"] = Rf2Layout.AsciiZ(w.TerrainName),
                ["surface"] = w.SurfaceType,
                ["brakeTempC"] = R(w.BrakeTemp - 273.15, 3),
                ["tempC"] = new[] { R(w.Temperature[0] - 273.15, 3), R(w.Temperature[1] - 273.15, 3), R(w.Temperature[2] - 273.15, 3) },
                ["carcassTempC"] = R(w.TireCarcassTemperature - 273.15, 3),
                ["pressure"] = R(w.Pressure, 3),
                ["wear"] = R(w.Wear, 6),
                ["load"] = R(w.TireLoad, 2),
                ["grip"] = R(w.GripFract, 5),
                ["rideHeight"] = R(w.RideHeight, 5),
                ["deflection"] = R(w.VerticalTireDeflection, 5),
                ["suspDeflection"] = R(w.SuspensionDeflection, 5),
                ["rotation"] = R(w.Rotation, 4),
                ["camber"] = R(w.Camber, 5),
                ["flat"] = w.Flat,
                ["detached"] = w.Detached
            }).ToArray()
        };
    }

    private static double R(double value, int digits) =>
        double.IsFinite(value) ? Math.Round(value, digits) : 0.0;

    private static string? GetOption(string[] args, string name)
    {
        var index = Array.IndexOf(args, name);
        return index >= 0 && index + 1 < args.Length ? args[index + 1] : null;
    }

    private static string Sanitize(string value) =>
        string.Concat(value.Select(c => Path.GetInvalidFileNameChars().Contains(c) || c == ' ' ? '-' : c));
}
