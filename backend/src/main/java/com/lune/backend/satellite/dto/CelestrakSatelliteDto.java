package com.lune.backend.satellite.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class CelestrakSatelliteDto {

    @JsonProperty("OBJECT_NAME")
    private String name;

    @JsonProperty("NORAD_CAT_ID")
    private Integer noradCatId;

    @JsonProperty("TLE_LINE1")
    private String line1;

    @JsonProperty("TLE_LINE2")
    private String line2;
}
