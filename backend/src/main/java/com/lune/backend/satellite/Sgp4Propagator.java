package com.lune.backend.satellite;

import com.lune.backend.satellite.dto.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import com.github.amsacode.predict4java.SatPos;
import com.github.amsacode.predict4java.Satellite;
import com.github.amsacode.predict4java.SatelliteFactory;
import com.github.amsacode.predict4java.TLE;

import java.time.Instant;
import java.util.Date;
import java.util.Optional;

/**
 * Local SGP4/SDP4 orbit propagation using predict4java.
 * No external API call needed — just TLE lines + a timestamp.
 */
@Component
@Slf4j
public class Sgp4Propagator {

    private static final double EARTH_RADIUS_KM = 6371.0;

    /**
     * Propagate a satellite's position from TLE lines at a given instant.
     * Returns geodetic (lat/lon/alt) and ECI Cartesian (position + velocity).
     */
    public Optional<PropagationResultDto> propagate(String name, int satelliteId,
                                                     String line1, String line2,
                                                     Instant instant) {
        try {
            String[] tleLines = new String[]{name.trim(), line1.trim(), line2.trim()};
            TLE tle = new TLE(tleLines);
            Satellite sat = SatelliteFactory.createSatellite(tle);

            Date date = Date.from(instant);
            sat.calculateSatelliteVectors(date);
            SatPos pos = sat.calculateSatelliteGroundTrack();

            double latDeg = Math.toDegrees(pos.getLatitude());
            double lonDeg = Math.toDegrees(pos.getLongitude());
            double altKm = pos.getAltitude();

            // Convert geodetic to ECI (approximate, good enough for visualization)
            double r = EARTH_RADIUS_KM + altKm;
            double latRad = pos.getLatitude();
            double lonRad = pos.getLongitude();

            // Compute GMST for ECI conversion
            double gmst = computeGmst(instant);
            double theta = lonRad + gmst;

            double eciX = r * Math.cos(latRad) * Math.cos(theta);
            double eciY = r * Math.cos(latRad) * Math.sin(theta);
            double eciZ = r * Math.sin(latRad);

            // Approximate velocity from a small time step
            Date datePlus = Date.from(instant.plusSeconds(1));
            sat.calculateSatelliteVectors(datePlus);
            SatPos posPlus = sat.calculateSatelliteGroundTrack();
            double altPlus = posPlus.getAltitude();
            double rPlus = EARTH_RADIUS_KM + altPlus;
            double latRadPlus = posPlus.getLatitude();
            double lonRadPlus = posPlus.getLongitude();
            double gmstPlus = computeGmst(instant.plusSeconds(1));
            double thetaPlus = lonRadPlus + gmstPlus;

            double eciXPlus = rPlus * Math.cos(latRadPlus) * Math.cos(thetaPlus);
            double eciYPlus = rPlus * Math.cos(latRadPlus) * Math.sin(thetaPlus);
            double eciZPlus = rPlus * Math.sin(latRadPlus);

            double vx = eciXPlus - eciX;
            double vy = eciYPlus - eciY;
            double vz = eciZPlus - eciZ;

            // Build DTOs matching the existing structure
            TleDto tleDto = new TleDto();
            tleDto.setSatelliteId(satelliteId);
            tleDto.setName(name);
            tleDto.setLine1(line1);
            tleDto.setLine2(line2);

            GeodeticDto geodeticDto = new GeodeticDto();
            geodeticDto.setLatitude(latDeg);
            geodeticDto.setLongitude(lonDeg);
            geodeticDto.setAltitude(altKm);

            CartesianDto posCart = new CartesianDto();
            posCart.setX(eciX);
            posCart.setY(eciY);
            posCart.setZ(eciZ);

            CartesianDto velCart = new CartesianDto();
            velCart.setX(vx);
            velCart.setY(vy);
            velCart.setZ(vz);

            VectorDto vectorDto = new VectorDto();
            vectorDto.setPosition(posCart);
            vectorDto.setVelocity(velCart);

            PropagationResultDto result = new PropagationResultDto();
            result.setTle(tleDto);
            result.setGeodetic(geodeticDto);
            result.setVector(vectorDto);

            return Optional.of(result);
        } catch (Exception e) {
            log.warn("Local SGP4 propagation failed for {} ({}): {}", name, satelliteId, e.getMessage());
            return Optional.empty();
        }
    }

    /**
     * Compute Greenwich Mean Sidereal Time in radians.
     */
    private double computeGmst(Instant instant) {
        // Julian date calculation
        double jd = instant.toEpochMilli() / 86400000.0 + 2440587.5;
        double t = (jd - 2451545.0) / 36525.0;
        // GMST in seconds
        double gmstSec = 67310.54841 + (876600.0 * 3600 + 8640184.812866) * t
                + 0.093104 * t * t - 6.2e-6 * t * t * t;
        // Convert to radians (mod 2pi)
        double gmstRad = (gmstSec % 86400.0) / 86400.0 * 2.0 * Math.PI;
        if (gmstRad < 0) gmstRad += 2.0 * Math.PI;
        return gmstRad;
    }
}
