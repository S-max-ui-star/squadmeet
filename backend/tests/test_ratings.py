from datetime import UTC, datetime, timedelta

import pytest
from sqlmodel import select

from app.models import ConditionVote, Place, Rating
from app.ratings import RECENT_DAYS, VOTES_NEEDED, IssueHistory, issue_history
from tests.test_auth import auth_header, register


@pytest.fixture
def place(session):
    """A table tennis Place far away in the Atlantic, so no OSM Place is near it."""
    place = Place(
        name="Testplatte", activity_type="table_tennis", location="SRID=4326;POINT(-30.5 0.5)"
    )
    session.add(place)
    session.commit()
    return place


@pytest.fixture
def paula(client):
    """(token, user id) of a registered user."""
    body = register(client).json()
    return body["token"], body["user"]["id"]


@pytest.fixture
def karl(client):
    body = register(client, nickname="Korb_Karl").json()
    return body["token"], body["user"]["id"]


def rate(client, token, place_id, stars=4, reasons=("table_good",)):
    return client.put(
        f"/api/places/{place_id}/ratings/mine",
        json={"stars": stars, "reasons": list(reasons)},
        headers=auth_header(token),
    )


def summary(client, place_id):
    return client.get(f"/api/places/{place_id}/ratings").json()


def old_rating(session, place, user_id, reasons, days):
    """A Rating written straight into the database, last changed `days` ago."""
    when = datetime.now(UTC) - timedelta(days=days)
    session.add(
        Rating(
            place_id=place.id,
            user_id=user_id,
            stars=2,
            reasons=reasons,
            created_at=when,
            updated_at=when,
        )
    )
    session.commit()


def test_the_form_offers_the_reasons_of_the_activity_type(client, place):
    keys = [r["key"] for r in client.get(f"/api/places/{place.id}/reasons").json()]

    assert "net_missing" in keys  # table tennis
    assert "litter" in keys  # general
    assert "hoop_damaged" not in keys  # basketball


def test_rate_a_place(client, place, paula):
    response = rate(client, paula[0], place.id, stars=5, reasons=["table_good", "fixed_net"])

    assert response.status_code == 200
    assert response.json()["stars"] == 5
    assert response.json()["reasons"] == ["table_good", "fixed_net"]
    mine = client.get(f"/api/places/{place.id}/ratings/mine", headers=auth_header(paula[0]))
    assert mine.json()["stars"] == 5


def test_no_rating_of_mine_yet_is_null(client, place, paula):
    mine = client.get(f"/api/places/{place.id}/ratings/mine", headers=auth_header(paula[0]))

    assert mine.status_code == 200
    assert mine.json() is None


def test_a_rating_needs_at_least_one_reason(client, place, paula):
    assert rate(client, paula[0], place.id, reasons=[]).status_code == 422
    assert summary(client, place.id)["count"] == 0


@pytest.mark.parametrize("stars", [0, 6])
def test_stars_must_be_one_to_five(client, place, paula, stars):
    assert rate(client, paula[0], place.id, stars=stars).status_code == 422


def test_a_reason_of_another_activity_type_is_rejected(client, place, paula):
    response = rate(client, paula[0], place.id, reasons=["hoop_damaged"])

    assert response.status_code == 422
    assert "hoop_damaged" in response.json()["detail"]


def test_rating_needs_a_login(client, place):
    response = client.put(
        f"/api/places/{place.id}/ratings/mine", json={"stars": 3, "reasons": ["table_good"]}
    )

    assert response.status_code == 401


def test_rating_an_unknown_place_is_404(client, paula):
    assert rate(client, paula[0], 999_999_999).status_code == 404
    assert client.get("/api/places/999999999/ratings").status_code == 404


def test_a_second_rating_by_the_same_user_replaces_the_first(client, session, place, paula):
    rate(client, paula[0], place.id, stars=2, reasons=["net_missing"])

    rate(client, paula[0], place.id, stars=5, reasons=["table_good"])

    ratings = session.exec(select(Rating).where(Rating.place_id == place.id)).all()
    assert [(r.stars, r.reasons) for r in ratings] == [(5, ["table_good"])]
    assert summary(client, place.id)["count"] == 1


def test_a_reason_sent_twice_counts_once(client, place, paula):
    response = rate(client, paula[0], place.id, reasons=["table_good", "table_good"])

    assert response.json()["reasons"] == ["table_good"]


def test_no_ratings_yet(client, place):
    assert summary(client, place.id) == {
        "count": 0,
        "average_stars": None,
        "top_reasons": [],
        "condition": {"state": "unknown", "issues": []},
    }


def test_average_stars_and_top_reasons(client, place, paula, karl):
    rate(client, paula[0], place.id, stars=5, reasons=["table_good", "fixed_net", "shade"])
    rate(client, karl[0], place.id, stars=2, reasons=["table_good", "often_crowded"])

    result = summary(client, place.id)

    assert result["count"] == 2
    assert result["average_stars"] == 3.5
    top = result["top_reasons"]
    assert len(top) == 3
    assert top[0] == {
        "key": "table_good",
        "label": "Platte in gutem Zustand",
        "positive": True,
        "count": 2,
        "fixed_at": None,
    }


def test_condition_is_good_when_recent_ratings_name_no_problem(client, place, paula):
    # "Oft überfüllt" is negative, but nobody has to fix it (SCRUM-18 decision).
    rate(client, paula[0], place.id, reasons=["table_good", "often_crowded"])

    assert summary(client, place.id)["condition"] == {"state": "good", "issues": []}


def test_condition_lists_the_problems_of_recent_ratings(client, place, paula, karl):
    rate(client, paula[0], place.id, stars=2, reasons=["net_missing", "litter"])
    rate(client, karl[0], place.id, stars=3, reasons=["net_missing", "table_good"])

    condition = summary(client, place.id)["condition"]

    assert condition["state"] == "issues"
    assert [(i["key"], i["count"]) for i in condition["issues"]] == [
        ("net_missing", 2),
        ("litter", 1),
    ]


def test_only_old_ratings_without_an_issue_give_an_unknown_condition(client, session, place, paula):
    old_rating(session, place, paula[1], ["table_good"], days=RECENT_DAYS + 1)

    assert summary(client, place.id)["condition"] == {"state": "unknown", "issues": []}


def test_an_issue_counts_without_a_check_for_two_months(client, place, paula):
    rate(client, paula[0], place.id, reasons=["net_missing"])

    [issue] = summary(client, place.id)["condition"]["issues"]

    assert issue["key"] == "net_missing"
    assert issue["needs_check"] is False


def test_after_two_months_an_issue_stays_and_users_are_asked(client, session, place, paula):
    old_rating(session, place, paula[1], ["net_missing"], days=RECENT_DAYS + 1)

    condition = summary(client, place.id)["condition"]

    assert condition["state"] == "issues"
    [issue] = condition["issues"]
    assert issue["needs_check"] is True
    assert (issue["still_there_votes"], issue["fixed_votes"]) == (0, 0)


def voters(client, n):
    """Tokens of n new users."""
    names = ["Vera_Voll", "Willi_Wurf", "Xenia_Netz", "Yusuf_Ball"][:n]
    return [register(client, nickname=name).json()["token"] for name in names]


def vote(client, token, place_id, still_there, key="net_missing"):
    return client.post(
        f"/api/places/{place_id}/condition/{key}/check",
        json={"still_there": still_there},
        headers=auth_header(token),
    )


def the_issue(client, place_id):
    issues = summary(client, place_id)["condition"]["issues"]
    return issues[0] if issues else None


def test_three_users_confirm_an_issue_for_two_more_months(client, session, place, paula):
    old_rating(session, place, paula[1], ["net_missing"], days=RECENT_DAYS + 1)
    tokens = voters(client, VOTES_NEEDED)

    for token in tokens[:-1]:
        assert vote(client, token, place.id, still_there=True).status_code == 200
    assert the_issue(client, place.id)["still_there_votes"] == VOTES_NEEDED - 1
    vote(client, tokens[-1], place.id, still_there=True)

    issue = the_issue(client, place.id)
    assert issue["needs_check"] is False
    assert (issue["still_there_votes"], issue["fixed_votes"]) == (0, 0)
    # Confirmed: no check is open, so "still there" waits two months; "fixed" is always open.
    assert vote(client, tokens[0], place.id, still_there=True).status_code == 409


def test_three_users_say_fixed_and_the_issue_ends(client, session, place, paula):
    old_rating(session, place, paula[1], ["net_missing"], days=RECENT_DAYS + 1)

    for token in voters(client, VOTES_NEEDED):
        vote(client, token, place.id, still_there=False)

    assert the_issue(client, place.id) is None
    assert summary(client, place.id)["condition"]["state"] == "good"


def test_a_later_vote_replaces_the_own_vote(client, session, place, paula):
    old_rating(session, place, paula[1], ["net_missing"], days=RECENT_DAYS + 1)
    [token] = voters(client, 1)

    for _ in range(VOTES_NEEDED):
        vote(client, token, place.id, still_there=False)
    vote(client, token, place.id, still_there=True)

    issue = the_issue(client, place.id)
    assert (issue["still_there_votes"], issue["fixed_votes"]) == (1, 0)
    assert issue["needs_check"] is True


def test_a_fixed_issue_keeps_the_rating_and_shows_its_reason_as_fixed(
    client, session, place, paula
):
    old_rating(session, place, paula[1], ["net_missing"], days=RECENT_DAYS + 1)
    for token in voters(client, VOTES_NEEDED):
        vote(client, token, place.id, still_there=False)

    result = summary(client, place.id)

    assert (result["count"], result["average_stars"]) == (1, 2.0)
    [chip] = result["top_reasons"]
    assert (chip["key"], chip["count"]) == ("net_missing", 1)
    assert chip["fixed_at"] is not None


def test_a_new_rating_brings_a_fixed_issue_back(client, session, place, paula, karl):
    old_rating(session, place, paula[1], ["net_missing"], days=RECENT_DAYS + 1)
    for token in voters(client, VOTES_NEEDED):
        vote(client, token, place.id, still_there=False)

    rate(client, karl[0], place.id, stars=2, reasons=["net_missing"])

    result = summary(client, place.id)
    assert result["condition"]["state"] == "issues"
    # Only the new Rating counts for the issue; the old one stays shown as fixed.
    [issue] = result["condition"]["issues"]
    assert (issue["count"], issue["needs_check"]) == (1, False)
    chips = {chip["fixed_at"] is None: chip["count"] for chip in result["top_reasons"]}
    assert chips == {True: 1, False: 1}


def test_voting_needs_a_login(client, place, paula):
    rate(client, paula[0], place.id, reasons=["net_missing"])

    no_login = client.post(
        f"/api/places/{place.id}/condition/net_missing/check", json={"still_there": False}
    )

    assert no_login.status_code == 401
    assert vote(client, paula[0], place.id, False, key="litter").status_code == 404


def test_still_there_needs_an_open_check(client, place, paula):
    rate(client, paula[0], place.id, reasons=["net_missing"])

    assert vote(client, paula[0], place.id, still_there=True).status_code == 409


def test_fixed_can_be_said_before_the_check(client, place, paula):
    rate(client, paula[0], place.id, reasons=["net_missing"])
    tokens = voters(client, VOTES_NEEDED)

    assert vote(client, tokens[0], place.id, still_there=False).status_code == 200
    issue = the_issue(client, place.id)
    assert (issue["needs_check"], issue["fixed_votes"]) == (False, 1)

    for token in tokens[1:]:
        vote(client, token, place.id, still_there=False)
    assert the_issue(client, place.id) is None


# The rules over a longer time, without the API: Ratings and votes at chosen days.

NOW = datetime(2026, 10, 9, tzinfo=UTC)


def day(n):
    return NOW - timedelta(days=n)


def votes(*answers):
    """(days ago, user id, still there) → ConditionVote rows."""
    return [
        ConditionVote(
            id=i, place_id=1, reason_key="net_missing", user_id=u, still_there=s, created_at=day(d)
        )
        for i, (d, u, s) in enumerate(answers)
    ]


def test_a_confirmed_issue_is_asked_about_again_two_months_later():
    reported = [day(200)]
    # Confirmed by 3 votes 130 days ago; that was more than RECENT_DAYS ago.
    confirmed = votes((132, 1, True), (131, 2, True), (130, 3, True))

    state = issue_history(reported, confirmed, NOW).open

    assert state.needs_check is True
    assert (state.still_there_votes, state.fixed_votes) == (0, 0)


def test_votes_of_an_earlier_check_do_not_count_in_the_next_one():
    reported = [day(200)]
    answers = votes((132, 1, True), (131, 2, True), (130, 3, True), (5, 1, False), (4, 2, False))

    state = issue_history(reported, answers, NOW).open

    # Users 1 and 2 said "fixed" in the new check; the 3 old "still there" votes are spent.
    assert (state.still_there_votes, state.fixed_votes) == (0, 2)


def test_mixed_votes_need_three_on_one_side():
    reported = [day(100)]
    answers = votes((10, 1, True), (9, 2, False), (8, 3, True), (7, 4, False))

    state = issue_history(reported, answers, NOW).open

    assert state.needs_check is True
    assert (state.still_there_votes, state.fixed_votes) == (2, 2)


def test_a_fixed_vote_before_the_check_still_counts_in_it():
    reported = [day(100)]
    answers = votes((90, 1, False), (5, 2, True), (4, 3, False))

    state = issue_history(reported, answers, NOW).open

    assert state.needs_check is True
    assert (state.still_there_votes, state.fixed_votes) == (1, 2)


def test_a_confirmation_drops_the_fixed_votes_before_it():
    reported = [day(200)]
    answers = votes((190, 4, False), (132, 1, True), (131, 2, True), (130, 3, True))

    state = issue_history(reported, answers, NOW).open

    assert (state.still_there_votes, state.fixed_votes) == (0, 0)


def test_no_rating_names_the_issue():
    assert issue_history([], [], NOW) == IssueHistory(open=None, fixed_at=None)


def test_three_fixed_votes_give_the_time_of_the_fix():
    reported = [day(100)]
    answers = votes((10, 1, False), (9, 2, False), (8, 3, False))

    assert issue_history(reported, answers, NOW) == IssueHistory(open=None, fixed_at=day(8))


def test_a_report_after_the_fix_opens_the_issue_and_keeps_the_fix():
    reported = [day(100), day(5)]
    answers = votes((10, 1, False), (9, 2, False), (8, 3, False))

    history = issue_history(reported, answers, NOW)

    assert history.fixed_at == day(8)
    assert history.open.needs_check is False
