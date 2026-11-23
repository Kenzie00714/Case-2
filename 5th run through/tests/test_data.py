import csv, os, shutil
import pytest
from zombie_sim.data_loader import load_world, DataValidationError, DATA_DIR, SQ_M_PER_SQ_MI


def test_world_loads_and_validates():
    w = load_world()
    assert len(w["routes"]) == 7
    assert all(len(stops) == 8 for stops in w["routes"].values())


def test_density_is_calculated_from_population_and_land_area():
    c = load_world()["counties"]["36061"]          # New York County
    assert c["population"] == 1597451
    assert c["density"] == pytest.approx(1597451 / (58683887 / SQ_M_PER_SQ_MI))
    assert 65000 < c["density"] < 75000


def test_route_distances_are_osrm_legs():
    stops = load_world()["routes"]["NYC"]
    assert stops[-1]["cum_mi"] == pytest.approx(3619019.6 / 1609.344, rel=1e-9)
    for code, s in load_world()["routes"].items():
        assert 2000 < s[-1]["cum_mi"] < 2500, code


def test_missing_snow_is_kept_as_missing_not_zero():
    st = load_world()["stations"]
    assert st["USW00024022"]["snow_in"] is None     # Laramie: NOAA publishes no January snow normal
    assert st["USW00023169"]["snow_in"] == 0.0      # Las Vegas: a real 0.0 normal


def test_station_used_for_each_stop_is_close_or_documented():
    for code, stops in load_world()["routes"].items():
        for s in stops:
            assert s["station_distance_mi"] < 150, (code, s["label"], s["station_distance_mi"])


def _copy_data(tmp_path):
    d = tmp_path / "data"
    shutil.copytree(DATA_DIR, d)
    return d


def _edit(path, fn):
    rows = list(csv.DictReader(open(path)))
    fn(rows)
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)


@pytest.mark.parametrize("field,value,expect", [
    ("pop_estimate_2023", "", "missing value"),
    ("pop_estimate_2023", "-5", "positive"),
    ("land_area_sq_m", "0", "land area must be positive"),
    ("state_name", "Texas", "does not match"),
    ("geoid", "123", "5 digits"),
])
def test_bad_county_values_are_rejected(tmp_path, field, value, expect):
    d = _copy_data(tmp_path)
    _edit(d / "city_data.csv", lambda rows: rows[0].__setitem__(field, value))
    with pytest.raises(DataValidationError) as e:
        load_world(str(d))
    assert expect in str(e.value)


def test_missing_temperature_is_an_error_not_zero(tmp_path):
    d = _copy_data(tmp_path)
    _edit(d / "weather_data.csv", lambda rows: rows[0].__setitem__("jan_tavg_normal_f", ""))
    with pytest.raises(DataValidationError, match="January temperature: missing"):
        load_world(str(d))


def test_unknown_county_in_route_is_rejected(tmp_path):
    d = _copy_data(tmp_path)
    _edit(d / "route_data.csv", lambda rows: rows[0].__setitem__("county_geoid", "99999"))
    with pytest.raises(DataValidationError, match="not in city_data.csv"):
        load_world(str(d))


def test_missing_file_is_reported(tmp_path):
    d = _copy_data(tmp_path)
    os.remove(d / "weather_data.csv")
    with pytest.raises(DataValidationError, match="Missing data file"):
        load_world(str(d))
