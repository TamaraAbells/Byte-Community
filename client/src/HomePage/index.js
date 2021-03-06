import React from 'react';
import './style.scss';

import { setFollowsMap, setLikesMap } from '../HomePage/homeActions';
import { setLoginModalVisibility } from '../AuthModal/authActions';

import logo from '../static/img/logo.png';
import topOverlay from '../static/img/top_shadow_overlay.png';

import { connect } from 'react-redux';
import { Link, withRouter } from 'react-router-dom';

import { Dropdown, Icon, Menu, message, Row, Col, Spin } from 'antd';

import LandingLogo from '../LandingLogo';
import SearchIcon from '../SearchIcon';
import ProfileIcon from '../ProfileIcon';
import NotificationIcon from '../NotificationIcon';
import ByteVideo from '../ByteVideo';
import Explore from '../Explore';
import User from '../User';
import NotificationList from '../NotificationList';
import MuteButton from '../MuteButton';
import EmptyState from '../EmptyState';
import NoMatchPage from '../NoMatchPage';

import Slider from 'react-slick';
import MediaQuery from 'react-responsive';

import { FEED_TYPES, SORT_TYPES, GOOGLE_AUTH_LINK } from '../utils/Constants';
import { shouldMuteAutoPlayVideo } from '../utils/Utils';
import AnalyticsUtil from '../utils/AnalyticsUtil';
import Api from '../utils/Api';

class HomePage extends React.Component {
	constructor(props) {
		super(props);
		this.sliderRef = React.createRef();
		this.state = {
			loading: true,
			posts: [],
			user: {},
			accounts: {},
			currentIndex: 0,
			cursor: null,
			hasMore: true,
			showSliderArrows: true,
			allowSwipe: true,
			isExploreOverlayOpen: false,
			isNotificationsOverlayOpen: false,
			isMuted: true,
			isPageScrollLocked: false,
			currentSortType: SORT_TYPES.POPULAR
		};
	}

	componentDidMount() {
		this.loadFeedData();
	}

	componentDidUpdate(prevProps) {
		const {
			match: { url },
			auth
		} = this.props;
		const prevUrl = prevProps.match.url;

		if (prevUrl !== url || prevProps.auth !== auth) {
			this.onFeedTypeChange();
		}
	}

	// loads the appropriate feed data based on the current route
	loadFeedData = () => {
		const {
			match: { params },
			auth
		} = this.props;
		const { username } = params;

		switch (this.getCurrentFeedType()) {
			case FEED_TYPES.TIMELINE:
				this.getTimeline();
				AnalyticsUtil.track('Load Timeline');
				break;
			case FEED_TYPES.POPULAR:
				this.getPopularFeed();
				AnalyticsUtil.track('Load Popular Feed');
				break;
			case FEED_TYPES.POPULAR2:
				this.getPopular2Feed();
				AnalyticsUtil.track('Load Popular 2 Feed');
				break;
			case FEED_TYPES.LATEST:
				this.getLatestFeed();
				AnalyticsUtil.track('Load Latest Feed');
				break;
			case FEED_TYPES.MIX:
				if (auth) {
					this.getMixFeed();
				} else {
					this.setState({ loading: false, user: null });
				}
				AnalyticsUtil.track('Load Mix Feed');
				break;
			case FEED_TYPES.PICKS:
				let { pickId } = params;
				this.getPicksFeed(pickId);
				AnalyticsUtil.track(
					'Load Picks Feed',
					{
						pickId
					},
					false
				);
				break;
			case FEED_TYPES.COMMUNITY:
				let { communityName, sort } = params;
				this.getCommunityFeed(communityName, sort);
				AnalyticsUtil.track(
					'Load Community Feed',
					{
						communityName,
						sort
					},
					true
				);
				break;
			case FEED_TYPES.HASHTAG:
				let { hashtag } = params;
				this.getHashtagFeed(hashtag);
				AnalyticsUtil.track(
					'Load Hashtag Feed',
					{
						hashtag
					},
					true
				);
				break;
			case FEED_TYPES.USER:
				this.getUserPosts(username);
				AnalyticsUtil.track(
					'Load User',
					{
						username
					},
					true
				);
				break;
			case FEED_TYPES.REBYTES:
				this.getUserRebytes(username);
				AnalyticsUtil.track(
					'Load User Rebytes',
					{
						username
					},
					true
				);
				break;
			case FEED_TYPES.POST:
				const { postId } = params;
				this.getPost(postId);
				AnalyticsUtil.track(
					'Load Post',
					{
						postId
					},
					false
				);
				break;
			default:
		}
	};

	// pagination callback to load more data
	loadMoreFeedData = () => {
		const { hasMore } = this.state;
		if (hasMore) {
			this.loadFeedData();
		}
	};

	async getTimeline() {
		this.getFeed(Api.getTimeline);
	}

	async getPopularFeed() {
		this.getFeed(Api.getPopularFeed);
	}

	async getPopular2Feed() {
		this.getFeed(Api.getPopular2Feed);
	}

	async getLatestFeed() {
		this.getFeed(Api.getLatestFeed);
	}

	async getMixFeed() {
		this.getFeed(Api.getMixFeed);
	}

	async getPicksFeed(pickId) {
		this.getFeed(Api.getPicksFeed, pickId);
	}

	async getHashtagFeed(hashtag) {
		this.getFeed(Api.getHashtagFeed, hashtag);
	}

	async getCommunityFeed(communityName, sort) {
		if (sort) {
			sort = sort.toLowerCase();
		}
		if (!Object.values(SORT_TYPES).includes(sort)) {
			// set default sort type to popular
			sort = SORT_TYPES.POPULAR;
		}
		this.setState({ currentSortType: sort });
		this.getFeed(Api.getCommunityFeed, communityName, sort);
	}

	async getUserPosts(username) {
		this.getUserFeed(Api.getUserPosts, username);
	}

	async getUserRebytes(username) {
		this.getUserFeed(Api.getUserRebytes, username);
	}

	async getUserId(username) {
		const {
			accounts: [user]
		} = await Api.searchUser(username);
		const { id } = user || {};
		return id;
	}

	async getFeed(apiMethod, ...args) {
		const { cursor: currentCursor } = this.state;

		const response = await apiMethod(...args, currentCursor);

		const { posts, accounts, cursor } = response;

		this.updateFeedData({ posts, accounts, cursor });
	}

	async getUserFeed(apiMethod, username) {
		const { cursor: currentCursor, user } = this.state;
		const { user: authUser } = this.props;
		const { id: authUserId, username: authUsername } = authUser;
		let { id: userId } = user;

		if (!userId) {
			if (authUsername) {
				// if current user page is the user that is logged in, use their userId to prevent wasted API call
				const isProfilePage =
					username.toLowerCase() === authUsername.toLowerCase();
				userId = isProfilePage ? authUserId : await this.getUserId(username);
			} else {
				userId = await this.getUserId(username);
			}

			if (!userId) {
				this.setState({ loading: false, user: null });
				return;
			}
		}

		const response = await apiMethod(userId, currentCursor);

		let { posts, rebytes, accounts, cursor } = response;

		if (rebytes) {
			posts = rebytes.map((rebyte) => {
				const { post } = rebyte;
				return post;
			});
		}

		const hasPosts = posts.length > 0;

		const userObj = hasPosts ? accounts[userId] : await Api.getUser(userId);

		this.updateFeedData({ posts, accounts, cursor, user: userObj });
	}

	async getPost(postId) {
		const response = await Api.getPost(postId);

		const { accounts } = response;
		const posts = [response];
		const [firstPost] = posts;
		const { authorID } = firstPost || {};

		const userObj = accounts && accounts[authorID];

		this.updateFeedData({ posts, accounts, user: userObj });
	}

	// reset state when feed type changes to accommodate new feed data
	onFeedTypeChange = () => {
		const { isMuted } = this.state;
		const { current: slider } = this.sliderRef;

		if (slider) {
			slider.slickGoTo(0);
		}

		this.unlockPageScroll();

		this.setState(
			{
				loading: true,
				posts: [],
				currentIndex: 0,
				cursor: null,
				user: {},
				isMuted: shouldMuteAutoPlayVideo() ? true : isMuted
			},
			() => {
				this.loadFeedData();
			}
		);
	};

	// called whenever the feed data changes
	updateFeedData = ({
		posts: newPosts,
		accounts: newAccounts,
		user,
		cursor
	}) => {
		const { posts, accounts } = this.state;
		const { setLikesMap, setFollowsMap } = this.props;

		const newPostsList = posts.concat(newPosts);
		const newAccountsMap = { ...accounts, ...newAccounts };

		setLikesMap(newPostsList);
		setFollowsMap(newAccountsMap);

		this.setState({
			loading: false,
			posts: newPostsList,
			accounts: newAccountsMap,
			user,
			cursor,
			hasMore: cursor ? true : false
		});
	};

	lockPageScroll = () => {
		document.body.style.overflowY = 'hidden';
		this.setState({ isPageScrollLocked: true });
	};

	unlockPageScroll = () => {
		document.body.style.overflowY = 'auto';
		this.setState({ isPageScrollLocked: false });
	};

	beforeSlideChange = (currentSlide, nextSlide) => {
		const video = document.getElementById(`byte-video-${currentSlide}`);
		this.setState({ currentIndex: nextSlide });
		if (video) {
			// pause the current video
			video.pause();
		}
	};

	afterSlideChange = (currentSlide) => {
		const { posts } = this.state;
		const video = document.getElementById(`byte-video-${currentSlide}`);
		if (video) {
			// play the new video
			video.play();
		}

		// noticeable on mobile: prevents scrolling after the first video
		if (currentSlide === 0) {
			this.unlockPageScroll();
		} else {
			this.lockPageScroll();
		}

		// pagination to load more feed data after buffer has been reached
		const PAGINATION_BUFFER = 3;
		if (posts.length - (currentSlide + 1) === PAGINATION_BUFFER) {
			this.loadMoreFeedData();
		}
	};

	// returns the type of the feed based on the current route
	getCurrentFeedType = () => {
		const {
			match: { path },
			auth
		} = this.props;

		if (path === '/') {
			return auth ? FEED_TYPES.TIMELINE : FEED_TYPES.POPULAR;
		}
		if (path.startsWith('/popular')) {
			if (path.startsWith('/popular2')) {
				return FEED_TYPES.POPULAR2;
			}
			return FEED_TYPES.POPULAR;
		}
		if (path.startsWith('/latest')) {
			return FEED_TYPES.LATEST;
		}
		if (path.startsWith('/mix')) {
			return FEED_TYPES.MIX;
		}
		if (path.startsWith('/picks/')) {
			return FEED_TYPES.PICKS;
		}
		if (path.startsWith('/hashtag/')) {
			return FEED_TYPES.HASHTAG;
		}
		if (path.startsWith('/community/')) {
			return FEED_TYPES.COMMUNITY;
		}
		if (path.startsWith('/post/')) {
			return FEED_TYPES.POST;
		}
		if (path.startsWith('/user/')) {
			if (path.endsWith('/rebytes')) {
				return FEED_TYPES.REBYTES;
			} else {
				return FEED_TYPES.USER;
			}
		}
	};

	// returns the name of the current category based on the current feed type
	getCategoryName = () => {
		switch (this.getCurrentFeedType()) {
			case FEED_TYPES.POPULAR:
				return 'Popular Now';
			case FEED_TYPES.POPULAR2:
				return 'New & Trending';
			case FEED_TYPES.LATEST:
				return 'Latest';
			case FEED_TYPES.MIX:
				return 'Your Mix';
			case FEED_TYPES.HASHTAG: {
				const {
					match: { params }
				} = this.props;
				const { hashtag } = params;
				return `#${hashtag}`;
			}
			case FEED_TYPES.COMMUNITY: {
				const {
					match: { params }
				} = this.props;
				const { categoryName } = params;
				return categoryName;
			}
			case FEED_TYPES.REBYTES:
				return 'Rebytes';
			default:
				return '';
		}
	};

	// middle component is the main component since the left and right components collapse on mobile
	getMiddleComponent = () => {
		const {
			loading,
			posts,
			showSliderArrows,
			allowSwipe,
			isExploreOverlayOpen,
			isNotificationsOverlayOpen,
			isMuted,
			currentSortType,
			currentIndex,
			isPageScrollLocked
		} = this.state;

		const sliderSettings = {
			dots: false,
			arrows: showSliderArrows,
			infinite: false,
			slidesToShow: 1,
			slidesToScroll: 1,
			touchThreshold: 20,
			vertical: true,
			verticalSwiping: true,
			swipeToSlide: true,
			swipe: allowSwipe,
			beforeChange: this.beforeSlideChange,
			afterChange: this.afterSlideChange
		};

		// empty state
		if (posts.length === 0 && !loading) {
			return (
				<>
					{this.shouldShowUserComponent() && (
						<MediaQuery maxWidth={992}>
							<User user={this.state.user} loading={loading} />
						</MediaQuery>
					)}
					<EmptyState message="Nothing to see here yet..." />
				</>
			);
		}

		const {
			match: { params }
		} = this.props;
		const { communityName } = params;

		const sortMenu = (
			<Menu onClick={this.onSortChange}>
				<Menu.Item key="popular">
					<Link to={`/community/${communityName}/popular`}>Popular</Link>
				</Menu.Item>
				<Menu.Item key="recent">
					<Link to={`/community/${communityName}/recent`}>Recent</Link>
				</Menu.Item>
			</Menu>
		);

		const currentFeedType = this.getCurrentFeedType();

		return (
			<>
				{this.shouldShowUserComponent() && (
					<MediaQuery maxWidth={768}>
						<User
							user={this.state.user}
							loading={loading}
							isPageScrollLocked={isPageScrollLocked}
						/>
					</MediaQuery>
				)}

				<div style={{ position: 'relative' }}>
					<Slider ref={this.sliderRef} {...sliderSettings}>
						{this.getFeedData()}
					</Slider>

					<div className="video-overlay-container">
						<img className="top-shadow" src={topOverlay} alt="" />

						<MuteButton
							style={{ display: loading ? 'none' : 'initial' }}
							index={currentIndex}
							isMuted={isMuted}
							onMuteChange={this.onMuteChange}
						/>

						<div className="video-overlay-header">
							{!loading && (
								<div className="logo-container">
									<Link to="/">
										<img className="logo" src={logo} alt="byte logo" />
									</Link>
								</div>
							)}

							<div className="video-overlay-header-title-container ">
								{!loading && (
									<div className="category-name">{this.getCategoryName()}</div>
								)}

								{!loading && currentFeedType === FEED_TYPES.COMMUNITY && (
									<Dropdown
										className="sort-dropdown"
										overlay={sortMenu}
										trigger={['click']}
									>
										<div className="sort-dropdown-button">
											<span className="current-sort-type">
												{currentSortType}
											</span>
										</div>
									</Dropdown>
								)}
							</div>

							<MediaQuery maxWidth={768}>
								{!loading && (
									<Icon
										className="search-button"
										component={SearchIcon}
										style={{
											fontSize: '48px',
											color: 'white'
										}}
										onClick={this.showExploreOverlay}
									/>
								)}
							</MediaQuery>

							{!loading && (
								<Icon
									className="notification-button"
									component={NotificationIcon}
									style={{
										fontSize: '48px',
										color: 'white',
										marginTop: '9px'
									}}
									onClick={this.showNotificationsOverlay}
								/>
							)}

							{!loading && (
								<Icon
									className="profile-button"
									component={ProfileIcon}
									style={{
										fontSize: '48px',
										color: 'white',
										marginTop: '9px'
									}}
									onClick={this.onProfileButtonClick}
								/>
							)}
						</div>
					</div>
				</div>

				{isExploreOverlayOpen && (
					<MediaQuery maxWidth={768}>
						<div className="explore-overlay-container">
							<Explore showBackButton onClose={this.onCloseExploreOverlay} />
						</div>
					</MediaQuery>
				)}

				{isNotificationsOverlayOpen && (
					<div className="notifications-overlay-container">
						<NotificationList onClose={this.onCloseNotificationsOverlay} />
					</div>
				)}
			</>
		);
	};

	// the right component is either Explore or User
	getRightComponent = () => {
		if (this.shouldShowUserComponent()) {
			const { loading, user } = this.state;
			return <User user={user} loading={loading} />;
		} else {
			return <Explore />;
		}
	};

	getFeedData = () => {
		const { posts, accounts, currentIndex, isMuted } = this.state;

		return posts.map((post, index) => {
			const { authorID } = post;
			return (
				<ByteVideo
					key={authorID}
					index={index}
					muted={isMuted}
					currentIndex={currentIndex}
					post={post}
					author={accounts[authorID]}
					onCommentsOverlayChange={this.onCommentsOverlayChange}
				/>
			);
		});
	};

	onCommentsOverlayChange = (isVisible) => {
		this.setState({
			showSliderArrows: isVisible ? false : true,
			allowSwipe: isVisible ? false : true
		});
	};

	onSortChange = (e) => {
		const { key: currentSortType } = e;
		this.setState({ currentSortType });
	};

	shouldShowUserComponent = () => {
		const getCurrentFeedType = this.getCurrentFeedType();
		return (
			getCurrentFeedType === FEED_TYPES.USER ||
			getCurrentFeedType === FEED_TYPES.REBYTES ||
			getCurrentFeedType === FEED_TYPES.POST
		);
	};

	onProfileButtonClick = () => {
		const { auth, user, history, setLoginModalVisibility } = this.props;
		const { username } = user;

		if (auth) {
			history.push(`/user/${username}`);
		} else {
			setLoginModalVisibility(true);
			window.open(GOOGLE_AUTH_LINK);
		}

		AnalyticsUtil.track('Profile Button Click');
	};

	showExploreOverlay = () => {
		this.setState({ isExploreOverlayOpen: true, showSliderArrows: false });
		AnalyticsUtil.track('Search Button Click');
	};

	onCloseExploreOverlay = () => {
		this.setState({ isExploreOverlayOpen: false, showSliderArrows: true });
		AnalyticsUtil.track('Search Back Button Click');
	};

	showNotificationsOverlay = () => {
		const { auth } = this.props;

		if (auth) {
			this.setState({
				isNotificationsOverlayOpen: true,
				showSliderArrows: false
			});
		} else {
			message.warning('Please login to view your notifications.');
		}

		AnalyticsUtil.track('Notifications Button Click');
	};

	onCloseNotificationsOverlay = () => {
		this.setState({
			isNotificationsOverlayOpen: false,
			showSliderArrows: true
		});

		AnalyticsUtil.track('Notifications Back Button Click');
	};

	onMuteChange = (isMuted) => {
		this.setState({ isMuted });
	};

	render() {
		const { loading, user } = this.state;
		const { auth } = this.props;

		const is404Page = !user && !loading;

		const currentFeedType = this.getCurrentFeedType();
		switch (currentFeedType) {
			case FEED_TYPES.USER:
			case FEED_TYPES.REBYTES:
			case FEED_TYPES.POST:
				if (is404Page) {
					return <NoMatchPage />;
				}
				break;
			case FEED_TYPES.MIX:
				if (!auth && is404Page) {
					return <NoMatchPage />;
				}
				break;
			default:
		}

		return (
			<div>
				<Row>
					<Col xs={0} sm={0} md={0} lg={8}>
						<LandingLogo />
					</Col>
					<Col md={12} lg={8}>
						<Spin spinning={loading}>{this.getMiddleComponent()}</Spin>
					</Col>
					<Col xs={0} md={12} lg={8}>
						{this.getRightComponent()}
					</Col>
				</Row>
			</div>
		);
	}
}

function mapStateToProps(state) {
	const { authReducer } = state;
	const { isAuthenticated, user } = authReducer;
	return {
		auth: isAuthenticated,
		user
	};
}

export default withRouter(
	connect(mapStateToProps, {
		setLikesMap,
		setFollowsMap,
		setLoginModalVisibility
	})(HomePage)
);
