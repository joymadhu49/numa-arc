// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title NumaAgent — ERC-721 soulbound agent identity on Arc Testnet.
/// @notice Fully on-chain metadata. Public mint. Unlimited supply.
contract NumaAgent {
    string public constant name = "Numa Agent";
    string public constant symbol = "NUMA";

    uint256 public totalSupply;

    struct AgentData {
        string agentName;
        string seed;
        string rarity;
        string imageUrl;
        uint64 mintedAt;
    }

    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;
    mapping(uint256 => AgentData) public agentOf;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event Mint(address indexed to, uint256 indexed tokenId, string agentName, string seed, string rarity);

    error TokenNotMinted();
    error Soulbound();
    error NotOwner();

    function balanceOf(address owner) external view returns (uint256) {
        require(owner != address(0), "zero address");
        return _balances[owner];
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address owner = _owners[tokenId];
        if (owner == address(0)) revert TokenNotMinted();
        return owner;
    }

    function mint(
        string calldata agentName,
        string calldata seed,
        string calldata rarity,
        string calldata imageUrl
    ) external returns (uint256 tokenId) {
        tokenId = ++totalSupply;
        _owners[tokenId] = msg.sender;
        _balances[msg.sender] += 1;
        agentOf[tokenId] = AgentData({
            agentName: agentName,
            seed: seed,
            rarity: rarity,
            imageUrl: imageUrl,
            mintedAt: uint64(block.timestamp)
        });
        emit Transfer(address(0), msg.sender, tokenId);
        emit Mint(msg.sender, tokenId, agentName, seed, rarity);
    }

    // Soulbound: disallow transfers.
    function transferFrom(address, address, uint256) external pure {
        revert Soulbound();
    }
    function safeTransferFrom(address, address, uint256) external pure {
        revert Soulbound();
    }
    function safeTransferFrom(address, address, uint256, bytes calldata) external pure {
        revert Soulbound();
    }
    function approve(address, uint256) external pure {
        revert Soulbound();
    }
    function setApprovalForAll(address, bool) external pure {
        revert Soulbound();
    }
    function getApproved(uint256) external pure returns (address) {
        return address(0);
    }
    function isApprovedForAll(address, address) external pure returns (bool) {
        return false;
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        if (_owners[tokenId] == address(0)) revert TokenNotMinted();
        AgentData memory a = agentOf[tokenId];
        string memory json = string(
            abi.encodePacked(
                '{"name":"', a.agentName,
                ' #', _toString(tokenId),
                '","description":"Numa Agent - on-chain soulbound identity on Arc.",',
                '"image":"', a.imageUrl, '",',
                '"attributes":[',
                    '{"trait_type":"Rarity","value":"', a.rarity, '"},',
                    '{"trait_type":"Seed","value":"', a.seed, '"},',
                    '{"trait_type":"Minted","value":"', _toString(uint256(a.mintedAt)), '"}',
                ']}'
            )
        );
        return string(abi.encodePacked("data:application/json;utf8,", json));
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        // ERC165, ERC721, ERC721Metadata
        return
            interfaceId == 0x01ffc9a7 ||
            interfaceId == 0x80ac58cd ||
            interfaceId == 0x5b5e139f;
    }

    function _toString(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 t = v; uint256 d;
        while (t != 0) { d++; t /= 10; }
        bytes memory b = new bytes(d);
        while (v != 0) { d--; b[d] = bytes1(uint8(48 + v % 10)); v /= 10; }
        return string(b);
    }
}
